use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::{
    BPS_DENOM, CONFIG_SEED, LP_AUTHORITY_SEED, LP_PRINCIPAL_TOKEN_SEED, LP_VAULT_SEED,
    MAX_BONUSBALL_MAX, MAX_ROUND_DURATION_SECS, MIN_BONUSBALL_MAX, MIN_ROUND_DURATION_SECS,
    NORMAL_BALL_COUNT, PRIZE_VAULT_AUTHORITY_SEED, PRIZE_VAULT_TOKEN_SEED, ROUND_COUNTER_SEED,
};
use crate::errors::LotteryError;
use crate::events::{ConfigInitialized, ConfigUpdated, EmergencyModeToggled, PausedToggled};
use crate::math::validate_tier_payout_bps;
use crate::state::config::{Config, ConfigParams, RoundCounter};
use crate::state::lp::LpVault;

pub(crate) fn validate_params(params: &ConfigParams) -> Result<()> {
    require!(
        params.default_ticket_price > 0,
        LotteryError::InvalidTicketPrice
    );
    require!(
        params.default_round_duration_secs >= MIN_ROUND_DURATION_SECS
            && params.default_round_duration_secs <= MAX_ROUND_DURATION_SECS,
        LotteryError::InvalidRoundDuration
    );
    require!(
        params.normal_ball_max as usize >= NORMAL_BALL_COUNT && params.normal_ball_max <= 90,
        LotteryError::InvalidConfig
    );
    require!(
        params.bonusball_max >= MIN_BONUSBALL_MAX && params.bonusball_max <= MAX_BONUSBALL_MAX,
        LotteryError::InvalidBonusballRange
    );
    require!(
        params.lp_edge_bps as u64 <= BPS_DENOM,
        LotteryError::InvalidConfig
    );
    require!(
        params.referral_fee_bps as u64 <= BPS_DENOM,
        LotteryError::InvalidConfig
    );
    require!(
        params.lp_edge_bps as u64 + params.referral_fee_bps as u64 <= BPS_DENOM,
        LotteryError::InvalidConfig
    );
    require!(
        params.referral_win_share_bps as u64 <= BPS_DENOM,
        LotteryError::InvalidConfig
    );
    require!(params.draw_timeout_slots > 0, LotteryError::InvalidConfig);
    validate_tier_payout_bps(&params.tier_payout_bps)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants::TIER_COUNT;
    use crate::state::config::UntakenTierDestination;

    fn valid_params() -> ConfigParams {
        let mut tier_payout_bps = [0u16; TIER_COUNT];
        tier_payout_bps[1] = 500;
        tier_payout_bps[11] = 7_000;
        ConfigParams {
            default_ticket_price: 1_000_000,
            default_round_duration_secs: MIN_ROUND_DURATION_SECS,
            register_window_secs: 0,
            guaranteed_prize_pool: 0,
            draw_timeout_slots: 10,
            normal_ball_max: 30,
            bonusball_max: 15,
            lp_edge_bps: 9_000,
            referral_fee_bps: 800,
            referral_win_share_bps: 800,
            lp_pool_cap: 0,
            tier_payout_bps,
            untaken_tier_destination: UntakenTierDestination::NextRound,
        }
    }

    #[test]
    fn validate_params_allows_zero_guarantee() {
        validate_params(&valid_params()).unwrap();
    }

    #[test]
    fn validate_params_rejects_zero_draw_timeout() {
        let mut params = valid_params();
        params.draw_timeout_slots = 0;
        assert!(validate_params(&params).is_err());
    }

    #[test]
    fn validate_params_rejects_fee_split_over_100_percent() {
        let mut params = valid_params();
        params.lp_edge_bps = 9_500;
        params.referral_fee_bps = 800;
        assert!(validate_params(&params).is_err());
    }
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = admin,
        seeds = [CONFIG_SEED],
        bump,
        space = 8 + Config::LEN,
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = admin,
        seeds = [ROUND_COUNTER_SEED],
        bump,
        space = 8 + RoundCounter::LEN,
    )]
    pub round_counter: Account<'info, RoundCounter>,

    #[account(
        init,
        payer = admin,
        seeds = [LP_VAULT_SEED],
        bump,
        space = 8 + LpVault::LEN,
    )]
    pub lp_vault: Account<'info, LpVault>,

    /// CHECK: PDA authority for prize vault token account; not deserialized.
    #[account(seeds = [PRIZE_VAULT_AUTHORITY_SEED], bump)]
    pub prize_vault_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = admin,
        seeds = [PRIZE_VAULT_TOKEN_SEED, usdc_mint.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = prize_vault_authority,
    )]
    pub prize_vault: Account<'info, TokenAccount>,

    /// CHECK: PDA authority for LP principal token account; not deserialized.
    #[account(seeds = [LP_AUTHORITY_SEED], bump)]
    pub lp_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = admin,
        seeds = [LP_PRINCIPAL_TOKEN_SEED, usdc_mint.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = lp_authority,
    )]
    pub lp_principal: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn initialize_config(ctx: Context<InitializeConfig>, params: ConfigParams) -> Result<()> {
    validate_params(&params)?;

    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.usdc_mint = ctx.accounts.usdc_mint.key();
    config.bump = ctx.bumps.config;
    config.prize_vault_authority_bump = ctx.bumps.prize_vault_authority;
    config.lp_authority_bump = ctx.bumps.lp_authority;
    config.paused = false;
    config.emergency_mode = false;
    config.apply_params(&params);

    let counter = &mut ctx.accounts.round_counter;
    counter.current_round_id = 0;
    counter.last_settled_round_id = 0;
    counter.bump = ctx.bumps.round_counter;

    let lp_vault = &mut ctx.accounts.lp_vault;
    lp_vault.bump = ctx.bumps.lp_vault;
    lp_vault.authority_bump = ctx.bumps.lp_authority;
    lp_vault.total_shares = 0;
    lp_vault.total_assets = 0;
    lp_vault.pending_withdraw_shares = 0;

    emit!(ConfigInitialized {
        admin: config.admin,
        usdc_mint: config.usdc_mint,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ LotteryError::Unauthorized,
    )]
    pub config: Account<'info, Config>,
}

pub fn update_config(ctx: Context<UpdateConfig>, params: ConfigParams) -> Result<()> {
    validate_params(&params)?;
    ctx.accounts.config.apply_params(&params);
    emit!(ConfigUpdated {
        admin: ctx.accounts.admin.key()
    });
    Ok(())
}

#[derive(Accounts)]
pub struct AdminToggle<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ LotteryError::Unauthorized,
    )]
    pub config: Account<'info, Config>,
}

pub fn set_paused(ctx: Context<AdminToggle>, paused: bool) -> Result<()> {
    ctx.accounts.config.paused = paused;
    emit!(PausedToggled { paused });
    Ok(())
}

pub fn set_emergency_mode(ctx: Context<AdminToggle>, enabled: bool) -> Result<()> {
    ctx.accounts.config.emergency_mode = enabled;
    emit!(EmergencyModeToggled { enabled });
    Ok(())
}
