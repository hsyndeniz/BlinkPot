use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::constants::{
    CONFIG_SEED, LP_AUTHORITY_SEED, LP_POSITION_SEED, LP_PRINCIPAL_TOKEN_SEED, LP_VAULT_SEED,
    ROUND_SEED,
};
use crate::errors::LotteryError;
use crate::events::{LpDeposited, LpWithdrawalFinalized, LpWithdrawalInitiated};
use crate::math::{assets_for_shares, shares_for_deposit};
use crate::state::config::{Config, RoundCounter};
use crate::state::lp::{LpPosition, LpVault};
use crate::state::round::Round;

#[derive(Accounts)]
pub struct LpDeposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [LP_VAULT_SEED],
        bump = lp_vault.bump,
    )]
    pub lp_vault: Account<'info, LpVault>,

    #[account(
        init_if_needed,
        payer = owner,
        seeds = [LP_POSITION_SEED, owner.key().as_ref()],
        bump,
        space = 8 + LpPosition::LEN,
    )]
    pub position: Account<'info, LpPosition>,

    #[account(address = config.usdc_mint @ LotteryError::InvalidTokenMint)]
    pub usdc_mint: Account<'info, Mint>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = owner,
    )]
    pub owner_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [LP_PRINCIPAL_TOKEN_SEED, usdc_mint.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = lp_authority,
    )]
    pub lp_principal: Account<'info, TokenAccount>,

    /// CHECK: PDA authority for lp_principal.
    #[account(seeds = [LP_AUTHORITY_SEED], bump = config.lp_authority_bump)]
    pub lp_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn lp_deposit(ctx: Context<LpDeposit>, amount: u64) -> Result<()> {
    require!(!ctx.accounts.config.paused, LotteryError::Paused);
    require!(
        !ctx.accounts.config.emergency_mode,
        LotteryError::EmergencyMode
    );
    require!(amount > 0, LotteryError::InvalidConfig);

    let cap = ctx.accounts.config.lp_pool_cap;
    let new_total = ctx
        .accounts
        .lp_vault
        .total_assets
        .checked_add(amount)
        .ok_or(error!(LotteryError::MathOverflow))?;
    if cap > 0 {
        require!(new_total <= cap, LotteryError::LpCapExceeded);
    }

    let shares = shares_for_deposit(
        amount,
        ctx.accounts.lp_vault.total_shares,
        ctx.accounts.lp_vault.total_assets,
    )?;
    require!(shares > 0, LotteryError::MathOverflow);

    token::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.owner_token_account.to_account_info(),
                mint: ctx.accounts.usdc_mint.to_account_info(),
                to: ctx.accounts.lp_principal.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.usdc_mint.decimals,
    )?;

    let position = &mut ctx.accounts.position;
    if position.owner == Pubkey::default() {
        position.owner = ctx.accounts.owner.key();
        position.bump = ctx.bumps.position;
    } else {
        require_keys_eq!(
            position.owner,
            ctx.accounts.owner.key(),
            LotteryError::Unauthorized
        );
    }
    position.shares = position
        .shares
        .checked_add(shares)
        .ok_or(error!(LotteryError::MathOverflow))?;
    position.last_deposit_at = Clock::get()?.unix_timestamp;

    let lp_vault = &mut ctx.accounts.lp_vault;
    lp_vault.total_shares = lp_vault
        .total_shares
        .checked_add(shares)
        .ok_or(error!(LotteryError::MathOverflow))?;
    lp_vault.total_assets = new_total;

    let shares_u64 = u64::try_from(shares).unwrap_or(u64::MAX);
    emit!(LpDeposited {
        owner: ctx.accounts.owner.key(),
        amount,
        shares_minted: shares_u64,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct LpInitiateWithdraw<'info> {
    pub owner: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        seeds = [crate::constants::ROUND_COUNTER_SEED],
        bump = round_counter.bump,
    )]
    pub round_counter: Account<'info, RoundCounter>,

    #[account(
        mut,
        seeds = [LP_VAULT_SEED],
        bump = lp_vault.bump,
    )]
    pub lp_vault: Account<'info, LpVault>,

    #[account(
        mut,
        seeds = [LP_POSITION_SEED, owner.key().as_ref()],
        bump = position.bump,
        has_one = owner @ LotteryError::Unauthorized,
    )]
    pub position: Account<'info, LpPosition>,
}

pub fn lp_initiate_withdraw(ctx: Context<LpInitiateWithdraw>, shares: u64) -> Result<()> {
    require!(
        !ctx.accounts.config.emergency_mode,
        LotteryError::EmergencyMode
    );
    let position = &mut ctx.accounts.position;
    require!(
        !position.has_pending_withdrawal(),
        LotteryError::LpWithdrawalPending
    );
    let shares_u128 = shares as u128;
    require!(shares_u128 > 0, LotteryError::InvalidConfig);
    require!(
        position.shares >= shares_u128,
        LotteryError::LpInsufficientShares
    );

    position.shares = position.shares - shares_u128;
    position.pending_withdraw_shares = shares_u128;
    position.pending_withdraw_round = ctx.accounts.round_counter.current_round_id;
    position.pending_withdraw_initiated_at = Clock::get()?.unix_timestamp;

    let lp_vault = &mut ctx.accounts.lp_vault;
    lp_vault.pending_withdraw_shares = lp_vault
        .pending_withdraw_shares
        .checked_add(shares_u128)
        .ok_or(error!(LotteryError::MathOverflow))?;

    emit!(LpWithdrawalInitiated {
        owner: ctx.accounts.owner.key(),
        shares,
        round_id: position.pending_withdraw_round,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct LpFinalizeWithdraw<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        seeds = [crate::constants::ROUND_COUNTER_SEED],
        bump = round_counter.bump,
    )]
    pub round_counter: Account<'info, RoundCounter>,

    /// CHECK: round at position.pending_withdraw_round; validated by seeds + state in handler.
    #[account(
        seeds = [ROUND_SEED, &position.pending_withdraw_round.to_le_bytes()],
        bump,
    )]
    pub pending_round: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [LP_VAULT_SEED],
        bump = lp_vault.bump,
    )]
    pub lp_vault: Account<'info, LpVault>,

    #[account(
        mut,
        seeds = [LP_POSITION_SEED, owner.key().as_ref()],
        bump = position.bump,
        has_one = owner @ LotteryError::Unauthorized,
    )]
    pub position: Account<'info, LpPosition>,

    #[account(address = config.usdc_mint @ LotteryError::InvalidTokenMint)]
    pub usdc_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [LP_PRINCIPAL_TOKEN_SEED, usdc_mint.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = lp_authority,
    )]
    pub lp_principal: Account<'info, TokenAccount>,

    /// CHECK: PDA authority for lp_principal, signs the CPI transfer.
    #[account(seeds = [LP_AUTHORITY_SEED], bump = config.lp_authority_bump)]
    pub lp_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = owner,
    )]
    pub owner_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn lp_finalize_withdraw(ctx: Context<LpFinalizeWithdraw>) -> Result<()> {
    require!(
        !ctx.accounts.config.emergency_mode,
        LotteryError::EmergencyMode
    );
    let position = &mut ctx.accounts.position;
    require!(
        position.has_pending_withdrawal(),
        LotteryError::LpNoPendingWithdrawal
    );
    let counter = &ctx.accounts.round_counter;
    require!(
        counter.current_round_id > position.pending_withdraw_round,
        LotteryError::LpWithdrawalNotReady
    );

    if position.pending_withdraw_round > 0 {
        let data = ctx.accounts.pending_round.try_borrow_data()?;
        let round = Round::try_deserialize(&mut data.as_ref())
            .map_err(|_| error!(LotteryError::LpWithdrawalNotReady))?;
        require!(round.is_terminal(), LotteryError::LpWithdrawalNotReady);
    }

    let lp_vault = &mut ctx.accounts.lp_vault;
    let shares_to_burn = position.pending_withdraw_shares;
    let assets = assets_for_shares(shares_to_burn, lp_vault.total_shares, lp_vault.total_assets)?;
    require!(
        ctx.accounts.lp_principal.amount >= assets,
        LotteryError::LpPrincipalUnderfunded
    );

    let signer_seeds: &[&[u8]] = &[LP_AUTHORITY_SEED, &[ctx.accounts.config.lp_authority_bump]];
    let signers = &[signer_seeds];
    token::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.lp_principal.to_account_info(),
                mint: ctx.accounts.usdc_mint.to_account_info(),
                to: ctx.accounts.owner_token_account.to_account_info(),
                authority: ctx.accounts.lp_authority.to_account_info(),
            },
            signers,
        ),
        assets,
        ctx.accounts.usdc_mint.decimals,
    )?;

    lp_vault.total_shares = lp_vault
        .total_shares
        .checked_sub(shares_to_burn)
        .ok_or(error!(LotteryError::MathOverflow))?;
    lp_vault.total_assets = lp_vault
        .total_assets
        .checked_sub(assets)
        .ok_or(error!(LotteryError::MathOverflow))?;
    lp_vault.pending_withdraw_shares = lp_vault
        .pending_withdraw_shares
        .checked_sub(shares_to_burn)
        .ok_or(error!(LotteryError::MathOverflow))?;

    position.pending_withdraw_shares = 0;
    position.pending_withdraw_round = 0;
    position.pending_withdraw_initiated_at = 0;

    let shares_u64 = u64::try_from(shares_to_burn).unwrap_or(u64::MAX);
    emit!(LpWithdrawalFinalized {
        owner: ctx.accounts.owner.key(),
        shares: shares_u64,
        amount: assets,
    });
    Ok(())
}
