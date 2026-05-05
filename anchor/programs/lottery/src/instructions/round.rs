use anchor_lang::prelude::*;

use crate::constants::{
    CONFIG_SEED, MAX_BONUSBALL_MAX, MAX_ROUND_DURATION_SECS, MIN_BONUSBALL_MAX,
    MIN_ROUND_DURATION_SECS, NORMAL_BALL_COUNT, ROUND_COUNTER_SEED, ROUND_SEED,
};
use crate::errors::LotteryError;
use crate::events::{RoundArchived, RoundOpened};
use crate::state::config::{Config, RoundCounter};
use crate::state::round::{Round, RoundState};

#[derive(Accounts)]
#[instruction(ticket_price: u64, duration_seconds: i64, bonusball_max: u8)]
pub struct StartRound<'info> {
    #[account(mut)]
    pub starter: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(mut, seeds = [ROUND_COUNTER_SEED], bump = round_counter.bump)]
    pub round_counter: Account<'info, RoundCounter>,

    /// CHECK: previous round; only validated when round_counter.current_round_id > 0.
    pub previous_round: UncheckedAccount<'info>,

    #[account(
        init,
        payer = starter,
        seeds = [ROUND_SEED, &(round_counter.current_round_id + 1).to_le_bytes()],
        bump,
        space = 8 + Round::LEN,
    )]
    pub round: Account<'info, Round>,

    pub system_program: Program<'info, System>,
}

pub fn start_round(
    ctx: Context<StartRound>,
    ticket_price: u64,
    duration_seconds: i64,
    bonusball_max: u8,
) -> Result<()> {
    require!(!ctx.accounts.config.paused, LotteryError::Paused);
    require!(!ctx.accounts.config.emergency_mode, LotteryError::EmergencyMode);

    let counter = &mut ctx.accounts.round_counter;
    let next_round_id = counter.current_round_id + 1;

    // Rollover from the previous round that will seed this round's prize pool.
    // The USDC already lives in prize_vault_ata (tally_tier_pools left it there);
    // we only need to update the accounting field.
    // If tally hasn't run yet (Settled / Registering states), rolled_to_next_round
    // is 0, so the new round simply starts with an empty pool — correct behavior.
    let seed_prize_pool: u64;

    if counter.current_round_id > 0 {
        let prev_pda = Pubkey::find_program_address(
            &[ROUND_SEED, &counter.current_round_id.to_le_bytes()],
            ctx.program_id,
        )
        .0;
        require_keys_eq!(
            ctx.accounts.previous_round.key(),
            prev_pda,
            LotteryError::PreviousRoundUnsettled
        );
        let data = ctx.accounts.previous_round.try_borrow_data()?;
        let prev = Round::try_deserialize(&mut data.as_ref())
            .map_err(|_| error!(LotteryError::PreviousRoundUnsettled))?;
        require!(
            matches!(
                prev.state,
                RoundState::Settled
                    | RoundState::Registering
                    | RoundState::Claimable
                    | RoundState::Archived
                    | RoundState::Emergency
            ),
            LotteryError::PreviousRoundUnsettled
        );
        seed_prize_pool = prev.rolled_to_next_round;
    } else {
        seed_prize_pool = 0;
    }

    let price = if ticket_price == 0 {
        ctx.accounts.config.default_ticket_price
    } else {
        ticket_price
    };
    require!(price > 0, LotteryError::InvalidTicketPrice);

    let duration = if duration_seconds == 0 {
        ctx.accounts.config.default_round_duration_secs
    } else {
        duration_seconds
    };
    require!(
        duration >= MIN_ROUND_DURATION_SECS && duration <= MAX_ROUND_DURATION_SECS,
        LotteryError::InvalidRoundDuration
    );

    let bonus_max = if bonusball_max == 0 {
        ctx.accounts.config.bonusball_max
    } else {
        bonusball_max
    };
    require!(
        bonus_max >= MIN_BONUSBALL_MAX && bonus_max <= MAX_BONUSBALL_MAX,
        LotteryError::InvalidBonusballRange
    );

    let now = Clock::get()?.unix_timestamp;
    let round = &mut ctx.accounts.round;
    round.round_id = next_round_id;
    round.state = RoundState::Open;
    round.bump = ctx.bumps.round;
    round.ticket_price = price;
    round.bonusball_max = bonus_max;
    round.normal_ball_max = ctx.accounts.config.normal_ball_max;
    round.opened_at = now;
    round.draw_time = now.saturating_add(duration);
    round.commit_slot = 0;
    round.settled_at = 0;
    round.register_deadline = 0;
    round.emergency_at = 0;
    round.randomness_account = Pubkey::default();
    round.winning_normals = [0u8; NORMAL_BALL_COUNT];
    round.winning_bonusball = 0;
    round.ticket_count = 0;
    round.registered_count = 0;
    round.claimed_count = 0;
    // Seed the prize pool with any rollover from the previous round.
    // The corresponding USDC is already in prize_vault_ata.
    round.prize_pool = seed_prize_pool;
    round.lp_edge_accrued = 0;
    round.referral_fees_accrued = 0;
    round.tier_winner_counts = [0u32; 12];
    round.tier_pool_amounts = [0u64; 12];
    round.tier_paid_counts = [0u32; 12];
    round.tier_paid_amounts = [0u64; 12];
    round.tally_done = false;
    round.rolled_to_lp = 0;
    round.rolled_to_next_round = 0;
    round.seed_prize_pool = seed_prize_pool;

    counter.current_round_id = next_round_id;

    emit!(RoundOpened {
        round_id: next_round_id,
        ticket_price: price,
        draw_time: round.draw_time,
        bonusball_max: bonus_max,
        seed_prize_pool,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct ArchiveRound<'info> {
    pub admin: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ LotteryError::Unauthorized,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [ROUND_SEED, &round.round_id.to_le_bytes()],
        bump = round.bump,
    )]
    pub round: Account<'info, Round>,
}

pub fn archive_round(ctx: Context<ArchiveRound>) -> Result<()> {
    let round = &mut ctx.accounts.round;
    require!(
        matches!(round.state, RoundState::Claimable | RoundState::Emergency),
        LotteryError::RoundNotArchivable
    );
    round.state = RoundState::Archived;
    emit!(RoundArchived { round_id: round.round_id });
    Ok(())
}
