use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::constants::{
    BPS_DENOM, CONFIG_SEED, LP_AUTHORITY_SEED, LP_PRINCIPAL_TOKEN_SEED, LP_VAULT_SEED,
    MAX_BONUSBALL_MAX, MAX_ROUND_DURATION_SECS, MIN_BONUSBALL_MAX, MIN_ROUND_DURATION_SECS,
    NORMAL_BALL_COUNT, PRIZE_VAULT_AUTHORITY_SEED, PRIZE_VAULT_TOKEN_SEED, ROUND_COUNTER_SEED,
    ROUND_SEED, TIER_COUNT,
};
use crate::errors::LotteryError;
use crate::events::{RoundArchived, RoundOpened};
use crate::math::{assets_for_shares, bps_amount, compute_dynamic_bonusball};
use crate::state::config::{Config, RoundCounter, UntakenTierDestination};
use crate::state::lp::LpVault;
use crate::state::round::{Round, RoundState};

#[derive(Accounts)]
#[instruction(ticket_price: u64, duration_seconds: i64, bonusball_max: u8, guaranteed_prize_pool_override: u64)]
pub struct StartRound<'info> {
    #[account(mut)]
    pub starter: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    #[account(mut, seeds = [ROUND_COUNTER_SEED], bump = round_counter.bump)]
    pub round_counter: Box<Account<'info, RoundCounter>>,

    /// CHECK: previous round; only validated when round_counter.current_round_id > 0.
    pub previous_round: UncheckedAccount<'info>,

    #[account(
        init,
        payer = starter,
        seeds = [ROUND_SEED, &(round_counter.current_round_id + 1).to_le_bytes()],
        bump,
        space = 8 + Round::LEN,
    )]
    pub round: Box<Account<'info, Round>>,

    #[account(
        mut,
        seeds = [LP_VAULT_SEED],
        bump = lp_vault.bump,
    )]
    pub lp_vault: Box<Account<'info, LpVault>>,

    #[account(address = config.payment_mint @ LotteryError::InvalidTokenMint)]
    pub payment_mint: Box<Account<'info, Mint>>,

    /// CHECK: PDA authority for prize_vault.
    #[account(seeds = [PRIZE_VAULT_AUTHORITY_SEED], bump = config.prize_vault_authority_bump)]
    pub prize_vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [PRIZE_VAULT_TOKEN_SEED, payment_mint.key().as_ref()],
        bump,
        token::mint = payment_mint,
        token::authority = prize_vault_authority,
    )]
    pub prize_vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: PDA authority for lp_principal, signs guarantee reserve transfers.
    #[account(seeds = [LP_AUTHORITY_SEED], bump = config.lp_authority_bump)]
    pub lp_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [LP_PRINCIPAL_TOKEN_SEED, payment_mint.key().as_ref()],
        bump,
        token::mint = payment_mint,
        token::authority = lp_authority,
    )]
    pub lp_principal: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn start_round(
    ctx: Context<StartRound>,
    ticket_price: u64,
    duration_seconds: i64,
    bonusball_max: u8,
    guaranteed_prize_pool_override: u64,
) -> Result<()> {
    require!(!ctx.accounts.config.paused, LotteryError::Paused);
    require!(
        !ctx.accounts.config.emergency_mode,
        LotteryError::EmergencyMode
    );

    let counter = &mut ctx.accounts.round_counter;
    let next_round_id = counter.current_round_id + 1;

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
        // Previous round must have been archived — otherwise we don't know what its
        // unclaimed remainder was, and rollovers would be racy with in-flight claims.
        require!(
            matches!(prev.state, RoundState::Archived),
            LotteryError::PreviousRoundUnsettled
        );
        seed_prize_pool = prev.rolled_to_next_round;
    } else {
        seed_prize_pool = 0;
    }

    // Resolve guaranteed prize pool — caller may override; otherwise config default.
    let guaranteed_prize_pool = if guaranteed_prize_pool_override > 0 {
        guaranteed_prize_pool_override
    } else {
        ctx.accounts.config.guaranteed_prize_pool
    };

    if guaranteed_prize_pool > 0 {
        // Cap guarantee against LP NAV. The cap is mandatory whenever a guarantee is
        // requested — start_round is permissionless, so without this requirement a
        // misconfigured `max_guarantee_per_round_bps = 0` (intended as "no cap") would
        // let any caller commit the entire LP to a single round. Admin must set a
        // nonzero cap in config before guarantees can be used.
        require!(
            ctx.accounts.config.max_guarantee_per_round_bps > 0,
            LotteryError::GuaranteeExceedsCap
        );
        let cap = bps_amount(
            ctx.accounts.lp_vault.total_assets,
            ctx.accounts.config.max_guarantee_per_round_bps,
        )?;
        require!(
            guaranteed_prize_pool <= cap,
            LotteryError::GuaranteeExceedsCap
        );
        let pending_assets = assets_for_shares(
            ctx.accounts.lp_vault.pending_withdraw_shares,
            ctx.accounts.lp_vault.total_shares,
            ctx.accounts.lp_vault.total_assets,
        )?;
        let available_assets = ctx
            .accounts
            .lp_vault
            .total_assets
            .checked_sub(pending_assets)
            .ok_or(error!(LotteryError::MathOverflow))?;
        require!(
            guaranteed_prize_pool <= available_assets,
            LotteryError::LpGuaranteeUnavailable
        );
        require!(
            ctx.accounts.lp_principal.amount >= guaranteed_prize_pool,
            LotteryError::LpPrincipalUnderfunded
        );

        let signer_seeds: &[&[u8]] = &[LP_AUTHORITY_SEED, &[ctx.accounts.config.lp_authority_bump]];
        let signers = &[signer_seeds];
        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.lp_principal.to_account_info(),
                    mint: ctx.accounts.payment_mint.to_account_info(),
                    to: ctx.accounts.prize_vault.to_account_info(),
                    authority: ctx.accounts.lp_authority.to_account_info(),
                },
                signers,
            ),
            guaranteed_prize_pool,
            ctx.accounts.config.payment_decimals,
        )?;
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

    // Resolve bonusball_max.
    // - If caller passes a non-zero value, that's an explicit override.
    // - Else if dynamic_bonusball_enabled, compute from initial pool (seed + guarantee).
    // - Else use config.bonusball_max as static default.
    let initial_pool = seed_prize_pool
        .checked_add(guaranteed_prize_pool)
        .ok_or(error!(LotteryError::MathOverflow))?;
    let bonus_max = if bonusball_max != 0 {
        bonusball_max
    } else if ctx.accounts.config.dynamic_bonusball_enabled {
        compute_dynamic_bonusball(
            initial_pool,
            ctx.accounts.config.bonusball_base,
            ctx.accounts.config.bonusball_pool_step_units,
        )
    } else {
        ctx.accounts.config.bonusball_max
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
    round.emergency_at = 0;
    round.randomness_account = Pubkey::default();
    round.winning_normals = [0u8; NORMAL_BALL_COUNT];
    round.winning_bonusball = 0;
    round.ticket_count = 0;
    round.claimed_count = 0;
    round.prize_pool = initial_pool;
    round.lp_edge_accrued = 0;
    round.referral_fees_accrued = 0;
    round.seed_prize_pool = seed_prize_pool;
    round.lp_guarantee_reserved = guaranteed_prize_pool;
    round.per_combo_payout = [0u64; TIER_COUNT];
    round.used_minimum_payouts = false;
    round.tier_paid_counts = [0u32; TIER_COUNT];
    round.tier_paid_amounts = [0u64; TIER_COUNT];
    round.rolled_to_lp = 0;
    round.rolled_to_next_round = 0;

    // Snapshot the winning-tier table so mid-round admin updates don't affect this round.
    round.tier_is_winning = ctx.accounts.config.tier_is_winning;

    counter.current_round_id = next_round_id;

    emit!(RoundOpened {
        round_id: next_round_id,
        ticket_price: price,
        draw_time: round.draw_time,
        bonusball_max: bonus_max,
        seed_prize_pool,
        guaranteed_prize_pool,
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
    pub config: Box<Account<'info, Config>>,

    #[account(
        mut,
        seeds = [ROUND_SEED, &round.round_id.to_le_bytes()],
        bump = round.bump,
    )]
    pub round: Box<Account<'info, Round>>,

    #[account(
        mut,
        seeds = [LP_VAULT_SEED],
        bump = lp_vault.bump,
    )]
    pub lp_vault: Box<Account<'info, LpVault>>,

    #[account(address = config.payment_mint @ LotteryError::InvalidTokenMint)]
    pub payment_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        seeds = [PRIZE_VAULT_TOKEN_SEED, payment_mint.key().as_ref()],
        bump,
        token::mint = payment_mint,
        token::authority = prize_vault_authority,
    )]
    pub prize_vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: PDA authority for prize_vault, signs the CPI transfer.
    #[account(seeds = [PRIZE_VAULT_AUTHORITY_SEED], bump = config.prize_vault_authority_bump)]
    pub prize_vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [LP_PRINCIPAL_TOKEN_SEED, payment_mint.key().as_ref()],
        bump,
        token::mint = payment_mint,
        token::authority = lp_authority,
    )]
    pub lp_principal: Box<Account<'info, TokenAccount>>,

    /// CHECK: PDA authority for lp_principal.
    #[account(seeds = [LP_AUTHORITY_SEED], bump = config.lp_authority_bump)]
    pub lp_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

/// Sweep the round's leftover prize budget once the claim window is considered closed.
/// Leftover = round.prize_pool - sum(tier_paid_amounts). Routes per
/// `config.untaken_tier_destination`: either back to the LP pool, or recorded as
/// `rolled_to_next_round` so the next `start_round` can pick it up as `seed_prize_pool`.
pub fn archive_round(ctx: Context<ArchiveRound>) -> Result<()> {
    // Honor the operational pause and emergency-mode flags. archive_round routes
    // potentially large leftovers (to LP or as next-round seed) and transitions a
    // round to its terminal state — both should be frozen when the protocol is
    // paused or in emergency, mirroring every other state-mutating instruction.
    require!(!ctx.accounts.config.paused, LotteryError::Paused);
    require!(
        !ctx.accounts.config.emergency_mode,
        LotteryError::EmergencyMode
    );
    let round = &mut ctx.accounts.round;
    require!(round.is_claimable(), LotteryError::RoundNotArchivable);

    // Sum the gross paid out across all tiers.
    let mut paid_total: u64 = 0;
    for v in round.tier_paid_amounts.iter() {
        paid_total = paid_total
            .checked_add(*v)
            .ok_or(error!(LotteryError::MathOverflow))?;
    }
    let leftover = round
        .prize_pool
        .checked_sub(paid_total)
        .ok_or(error!(LotteryError::MathOverflow))?;

    match ctx.accounts.config.untaken_tier_destination {
        UntakenTierDestination::LpPool => {
            round.rolled_to_lp = leftover;
            round.rolled_to_next_round = 0;
            if leftover > 0 {
                let signer_seeds: &[&[u8]] = &[
                    PRIZE_VAULT_AUTHORITY_SEED,
                    &[ctx.accounts.config.prize_vault_authority_bump],
                ];
                let signers = &[signer_seeds];
                token::transfer_checked(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        TransferChecked {
                            from: ctx.accounts.prize_vault.to_account_info(),
                            mint: ctx.accounts.payment_mint.to_account_info(),
                            to: ctx.accounts.lp_principal.to_account_info(),
                            authority: ctx.accounts.prize_vault_authority.to_account_info(),
                        },
                        signers,
                    ),
                    leftover,
                    ctx.accounts.config.payment_decimals,
                )?;
                let lp_vault = &mut ctx.accounts.lp_vault;
                lp_vault.total_assets = lp_vault
                    .total_assets
                    .checked_add(leftover)
                    .ok_or(error!(LotteryError::MathOverflow))?;
            }
        }
        UntakenTierDestination::NextRound => {
            round.rolled_to_lp = 0;
            round.rolled_to_next_round = leftover;
            // The leftover stays inside `prize_vault` (a single shared PDA) — the next
            // `start_round` reads `prev.rolled_to_next_round` as `seed_prize_pool`.
        }
    }

    round.state = RoundState::Archived;
    emit!(RoundArchived {
        round_id: round.round_id,
        rolled_to_lp: round.rolled_to_lp,
        rolled_to_next_round: round.rolled_to_next_round,
    });
    let _ = BPS_DENOM;
    Ok(())
}
