use anchor_lang::prelude::*;
use switchboard_on_demand::RandomnessAccountData;
// Import only the PID that is active for this build target so there are no
// dead-import warnings.  Build with `--features devnet` for localnet / devnet;
// omit the feature (default) for mainnet.
#[cfg(feature = "devnet")]
use switchboard_on_demand::ON_DEMAND_DEVNET_PID;
#[cfg(not(feature = "devnet"))]
use switchboard_on_demand::ON_DEMAND_MAINNET_PID;

// Compile-time constant: which Switchboard program is trusted.
// A devnet binary cannot be tricked by a mainnet randomness account, and vice-versa.
#[cfg(feature = "devnet")]
const EXPECTED_SB_PID: Pubkey = ON_DEMAND_DEVNET_PID;
#[cfg(not(feature = "devnet"))]
const EXPECTED_SB_PID: Pubkey = ON_DEMAND_MAINNET_PID;

use crate::constants::{CONFIG_SEED, ROUND_SEED};
use crate::errors::LotteryError;
use crate::events::{DrawCommitted, DrawSettled};
use crate::math::derive_winning_numbers;
use crate::state::config::Config;
use crate::state::round::{Round, RoundState};

#[derive(Accounts)]
pub struct CommitDraw<'info> {
    pub trigger: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [ROUND_SEED, &round.round_id.to_le_bytes()],
        bump = round.bump,
    )]
    pub round: Account<'info, Round>,

    /// CHECK: Switchboard randomness account; parsed in handler.
    pub randomness_account: UncheckedAccount<'info>,
}

pub fn commit_draw(ctx: Context<CommitDraw>) -> Result<()> {
    require!(!ctx.accounts.config.paused, LotteryError::Paused);
    require!(!ctx.accounts.config.emergency_mode, LotteryError::EmergencyMode);

    let now = Clock::get()?.unix_timestamp;
    let round = &mut ctx.accounts.round;

    require!(round.is_open(), LotteryError::RoundNotOpen);
    require!(now >= round.draw_time, LotteryError::DrawTimeNotReached);

    // Verify the randomness account is owned by the expected Switchboard On-Demand
    // program (devnet or mainnet, selected at compile time via the `devnet` feature).
    let owner = *ctx.accounts.randomness_account.owner;
    require!(
        owner == EXPECTED_SB_PID,
        LotteryError::InvalidRandomnessAccount
    );

    let data = ctx.accounts.randomness_account.try_borrow_data()?;
    let randomness = RandomnessAccountData::parse(data)
        .map_err(|_| error!(LotteryError::InvalidRandomnessAccount))?;

    // The randomness MUST NOT have been revealed before (reveal_slot == 0 means
    // the Switchboard revealIx has never been submitted for this account).
    //
    // The old guard `get_value(slot).is_err()` was insufficient: it only checks
    // `clock.slot == reveal_slot`, so it would also return an error for an account
    // that was *already revealed* in a past slot — letting an attacker reuse a
    // randomness account whose value they already know and front-run the outcome.
    require!(
        randomness.reveal_slot == 0,
        LotteryError::RandomnessAlreadyRevealed
    );

    // Store seed_slot from the randomness account rather than the current clock slot.
    // This is the slot whose hash Switchboard will use as entropy — we need to verify
    // this exact value again in reveal_draw to ensure the same commitment is being revealed.
    let seed_slot = randomness.seed_slot;

    round.state = RoundState::Drawing;
    round.randomness_account = ctx.accounts.randomness_account.key();
    round.commit_slot = seed_slot;

    emit!(DrawCommitted {
        round_id: round.round_id,
        randomness_account: round.randomness_account,
        commit_slot: seed_slot,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct RevealDraw<'info> {
    pub trigger: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [ROUND_SEED, &round.round_id.to_le_bytes()],
        bump = round.bump,
    )]
    pub round: Account<'info, Round>,

    /// CHECK: Switchboard randomness account; key checked against round.randomness_account.
    pub randomness_account: UncheckedAccount<'info>,
}

pub fn reveal_draw(ctx: Context<RevealDraw>) -> Result<()> {
    require!(!ctx.accounts.config.emergency_mode, LotteryError::EmergencyMode);

    let round = &mut ctx.accounts.round;
    require!(round.is_drawing(), LotteryError::RoundNotDrawing);
    require_keys_eq!(
        ctx.accounts.randomness_account.key(),
        round.randomness_account,
        LotteryError::InvalidRandomnessAccount
    );

    let clock = Clock::get()?;
    let data = ctx.accounts.randomness_account.try_borrow_data()?;
    let randomness = RandomnessAccountData::parse(data)
        .map_err(|_| error!(LotteryError::InvalidRandomnessAccount))?;

    // Verify this is the same commitment that was recorded at commit time.
    // seed_slot is the slot whose hash Switchboard used as entropy — if it doesn't
    // match what we stored, someone is trying to substitute a different randomness account.
    require_eq!(
        randomness.seed_slot,
        round.commit_slot,
        LotteryError::InvalidRandomnessAccount
    );

    // get_value checks clock_slot == reveal_slot; Switchboard's revealIx (which ran
    // just before this instruction in the same tx) writes reveal_slot = clock.slot.
    let revealed = randomness
        .get_value(clock.slot)
        .map_err(|_| error!(LotteryError::RandomnessNotResolved))?;

    let mut bytes = [0u8; 32];
    let len = revealed.len().min(32);
    bytes[..len].copy_from_slice(&revealed[..len]);

    let (normals, bonusball) = derive_winning_numbers(
        &bytes,
        round.normal_ball_max,
        round.bonusball_max,
    )?;

    round.winning_normals = normals;
    round.winning_bonusball = bonusball;
    round.state = RoundState::Settled;
    round.settled_at = clock.unix_timestamp;

    // Register deadline is deprecated; registration is permissionless and can
    // happen any time before tally.
    round.register_deadline = 0;

    emit!(DrawSettled {
        round_id: round.round_id,
        winning_normals: normals,
        winning_bonusball: bonusball,
        register_deadline: round.register_deadline,
    });
    Ok(())
}
