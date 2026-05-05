use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::constants::{
    CONFIG_SEED, LP_AUTHORITY_SEED, LP_POSITION_SEED, LP_PRINCIPAL_TOKEN_SEED, LP_VAULT_SEED,
    PRIZE_VAULT_AUTHORITY_SEED, PRIZE_VAULT_TOKEN_SEED, REFERRAL_SEED, ROUND_SEED, TICKET_SEED,
};
use crate::errors::LotteryError;
use crate::events::{EmergencyLpWithdrawn, EmergencyTicketRefunded, RoundEmergencyEntered};
use crate::math::{assets_for_shares, bps_amount};
use crate::state::config::Config;
use crate::state::lp::{LpPosition, LpVault};
use crate::state::referral::Referral;
use crate::state::round::{Round, RoundState};
use crate::state::ticket::Ticket;

#[derive(Accounts)]
pub struct EnterRoundEmergency<'info> {
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
}

pub fn enter_round_emergency(ctx: Context<EnterRoundEmergency>) -> Result<()> {
    let round = &mut ctx.accounts.round;
    require!(
        !matches!(round.state, RoundState::Claimable | RoundState::Archived),
        LotteryError::RoundNotArchivable
    );
    round.state = RoundState::Emergency;
    round.emergency_at = Clock::get()?.unix_timestamp;

    emit!(RoundEmergencyEntered {
        round_id: round.round_id,
        emergency_at: round.emergency_at,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct EmergencyRefundTicket<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    #[account(
        mut,
        seeds = [ROUND_SEED, &round.round_id.to_le_bytes()],
        bump = round.bump,
    )]
    pub round: Box<Account<'info, Round>>,

    #[account(
        mut,
        close = owner,
        seeds = [
            TICKET_SEED,
            &ticket.round_id.to_le_bytes(),
            ticket.owner.as_ref(),
            &ticket.ticket_index.to_le_bytes(),
        ],
        bump = ticket.bump,
        has_one = owner @ LotteryError::Unauthorized,
    )]
    pub ticket: Box<Account<'info, Ticket>>,

    #[account(address = config.usdc_mint @ LotteryError::InvalidTokenMint)]
    pub usdc_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        seeds = [PRIZE_VAULT_TOKEN_SEED, usdc_mint.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = prize_vault_authority,
    )]
    pub prize_vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: PDA authority for prize_vault, signs the CPI transfer.
    #[account(seeds = [PRIZE_VAULT_AUTHORITY_SEED], bump = config.prize_vault_authority_bump)]
    pub prize_vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [LP_VAULT_SEED],
        bump = lp_vault.bump,
    )]
    pub lp_vault: Box<Account<'info, LpVault>>,

    #[account(
        mut,
        seeds = [LP_PRINCIPAL_TOKEN_SEED, usdc_mint.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = lp_authority,
    )]
    pub lp_principal: Box<Account<'info, TokenAccount>>,

    /// CHECK: PDA authority for lp_principal, signs shortfall refunds.
    #[account(seeds = [LP_AUTHORITY_SEED], bump = config.lp_authority_bump)]
    pub lp_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [REFERRAL_SEED, ticket.referrer.as_ref()],
        bump,
    )]
    pub referrer_account: Option<Box<Account<'info, Referral>>>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = owner,
    )]
    pub owner_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn emergency_refund_ticket(ctx: Context<EmergencyRefundTicket>) -> Result<()> {
    let round = &mut ctx.accounts.round;
    let ticket = &ctx.accounts.ticket;
    require!(round.is_emergency(), LotteryError::RoundNotEmergency);
    require_eq!(
        ticket.round_id,
        round.round_id,
        LotteryError::RoundIdMismatch
    );
    require!(!ticket.claimed, LotteryError::TicketAlreadyClaimed);

    let refund = ticket.price_paid;
    if ticket.has_referrer {
        let referral_fee = bps_amount(ticket.price_paid, ctx.accounts.config.referral_fee_bps)?;
        let referrer_account = ctx
            .accounts
            .referrer_account
            .as_mut()
            .ok_or(error!(LotteryError::ReferralRequired))?;
        require_keys_eq!(
            referrer_account.owner,
            ticket.referrer,
            LotteryError::InvalidConfig
        );
        // A referrer may have already claimed some or all of this accrual before
        // the round was moved to emergency. Do not block the buyer's refund; just
        // cancel whatever liability is still outstanding for this referrer PDA.
        let clawback = referral_fee.min(referrer_account.accrued);
        referrer_account.accrued = referrer_account
            .accrued
            .checked_sub(clawback)
            .ok_or(error!(LotteryError::MathOverflow))?;
        referrer_account.lifetime_earned =
            referrer_account.lifetime_earned.saturating_sub(clawback);
    } else {
        require!(
            ctx.accounts.referrer_account.is_none(),
            LotteryError::InvalidConfig
        );
    }

    let prize_refund = refund.min(ctx.accounts.prize_vault.amount);
    let signer_seeds: &[&[u8]] = &[
        PRIZE_VAULT_AUTHORITY_SEED,
        &[ctx.accounts.config.prize_vault_authority_bump],
    ];
    let signers = &[signer_seeds];
    if prize_refund > 0 {
        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.prize_vault.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.owner_token_account.to_account_info(),
                    authority: ctx.accounts.prize_vault_authority.to_account_info(),
                },
                signers,
            ),
            prize_refund,
            ctx.accounts.usdc_mint.decimals,
        )?;
    }

    let shortfall = refund
        .checked_sub(prize_refund)
        .ok_or(error!(LotteryError::MathOverflow))?;
    if shortfall > 0 {
        require!(
            ctx.accounts.lp_principal.amount >= shortfall,
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
            shortfall,
            ctx.accounts.usdc_mint.decimals,
        )?;
        ctx.accounts.lp_vault.total_assets = ctx
            .accounts
            .lp_vault
            .total_assets
            .checked_sub(shortfall)
            .ok_or(error!(LotteryError::MathOverflow))?;
    }

    emit!(EmergencyTicketRefunded {
        round_id: ticket.round_id,
        ticket_index: ticket.ticket_index,
        owner: ticket.owner,
        amount: refund,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct EmergencyLpWithdraw<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    #[account(
        mut,
        seeds = [LP_VAULT_SEED],
        bump = lp_vault.bump,
    )]
    pub lp_vault: Box<Account<'info, LpVault>>,

    #[account(
        mut,
        seeds = [LP_POSITION_SEED, owner.key().as_ref()],
        bump = position.bump,
        has_one = owner @ LotteryError::Unauthorized,
    )]
    pub position: Box<Account<'info, LpPosition>>,

    #[account(address = config.usdc_mint @ LotteryError::InvalidTokenMint)]
    pub usdc_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        seeds = [LP_PRINCIPAL_TOKEN_SEED, usdc_mint.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = lp_authority,
    )]
    pub lp_principal: Box<Account<'info, TokenAccount>>,

    /// CHECK: PDA authority for lp_principal, signs the CPI transfer.
    #[account(seeds = [LP_AUTHORITY_SEED], bump = config.lp_authority_bump)]
    pub lp_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = owner,
    )]
    pub owner_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn emergency_lp_withdraw(ctx: Context<EmergencyLpWithdraw>) -> Result<()> {
    require!(
        ctx.accounts.config.emergency_mode,
        LotteryError::NotInEmergencyMode
    );
    let position = &mut ctx.accounts.position;
    let lp_vault = &mut ctx.accounts.lp_vault;

    let total_shares = position
        .shares
        .checked_add(position.pending_withdraw_shares)
        .ok_or(error!(LotteryError::MathOverflow))?;
    require!(total_shares > 0, LotteryError::LpInsufficientShares);

    let amount = assets_for_shares(total_shares, lp_vault.total_shares, lp_vault.total_assets)?;
    let payable = amount.min(ctx.accounts.lp_principal.amount);

    if payable > 0 {
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
            payable,
            ctx.accounts.usdc_mint.decimals,
        )?;
    }

    lp_vault.total_shares = lp_vault.total_shares.saturating_sub(total_shares);
    lp_vault.total_assets = lp_vault.total_assets.saturating_sub(amount);
    if position.pending_withdraw_shares > 0 {
        lp_vault.pending_withdraw_shares = lp_vault
            .pending_withdraw_shares
            .saturating_sub(position.pending_withdraw_shares);
    }
    position.shares = 0;
    position.pending_withdraw_shares = 0;
    position.pending_withdraw_round = 0;
    position.pending_withdraw_initiated_at = 0;

    let shares_u64 = u64::try_from(total_shares).unwrap_or(u64::MAX);
    emit!(EmergencyLpWithdrawn {
        owner: ctx.accounts.owner.key(),
        shares: shares_u64,
        amount: payable,
    });
    Ok(())
}
