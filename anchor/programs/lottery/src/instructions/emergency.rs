use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::{
    CONFIG_SEED, LP_AUTHORITY_SEED, LP_POSITION_SEED, LP_PRINCIPAL_TOKEN_SEED, LP_VAULT_SEED,
    PRIZE_VAULT_AUTHORITY_SEED, PRIZE_VAULT_TOKEN_SEED, ROUND_SEED, TICKET_SEED,
};
use crate::errors::LotteryError;
use crate::events::{EmergencyLpWithdrawn, EmergencyTicketRefunded};
use crate::math::assets_for_shares;
use crate::state::config::Config;
use crate::state::lp::{LpPosition, LpVault};
use crate::state::round::Round;
use crate::state::ticket::Ticket;

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
    )]
    pub prize_vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: PDA authority for prize_vault, signs the CPI transfer.
    #[account(seeds = [PRIZE_VAULT_AUTHORITY_SEED], bump = config.prize_vault_authority_bump)]
    pub prize_vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = owner,
    )]
    pub owner_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn emergency_refund_ticket(ctx: Context<EmergencyRefundTicket>) -> Result<()> {
    require!(ctx.accounts.config.emergency_mode, LotteryError::NotInEmergencyMode);
    let round = &mut ctx.accounts.round;
    let ticket = &ctx.accounts.ticket;
    require_eq!(ticket.round_id, round.round_id, LotteryError::RoundIdMismatch);
    require!(!ticket.claimed, LotteryError::TicketAlreadyClaimed);

    let refund = ticket.price_paid;
    let signer_seeds: &[&[u8]] = &[
        PRIZE_VAULT_AUTHORITY_SEED,
        &[ctx.accounts.config.prize_vault_authority_bump],
    ];
    let signers = &[signer_seeds];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.prize_vault.to_account_info(),
                to: ctx.accounts.owner_token_account.to_account_info(),
                authority: ctx.accounts.prize_vault_authority.to_account_info(),
            },
            signers,
        ),
        refund,
    )?;

    round.prize_pool = round.prize_pool.saturating_sub(refund);
    round.ticket_count = round.ticket_count.saturating_sub(1);

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
    require!(ctx.accounts.config.emergency_mode, LotteryError::NotInEmergencyMode);
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
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.lp_principal.to_account_info(),
                    to: ctx.accounts.owner_token_account.to_account_info(),
                    authority: ctx.accounts.lp_authority.to_account_info(),
                },
                signers,
            ),
            payable,
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
