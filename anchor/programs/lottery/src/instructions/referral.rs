use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::constants::{
    CONFIG_SEED, PRIZE_VAULT_AUTHORITY_SEED, PRIZE_VAULT_TOKEN_SEED, REFERRAL_SEED,
};
use crate::errors::LotteryError;
use crate::events::{ReferralFeesClaimed, ReferralInitialized};
use crate::state::config::Config;
use crate::state::referral::Referral;

#[derive(Accounts)]
pub struct InitializeReferral<'info> {
    #[account(mut)]
    pub referrer: Signer<'info>,

    #[account(
        init,
        payer = referrer,
        seeds = [REFERRAL_SEED, referrer.key().as_ref()],
        bump,
        space = 8 + Referral::LEN,
    )]
    pub referral: Account<'info, Referral>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_referral(ctx: Context<InitializeReferral>) -> Result<()> {
    let referral = &mut ctx.accounts.referral;
    referral.owner = ctx.accounts.referrer.key();
    referral.accrued = 0;
    referral.lifetime_earned = 0;
    referral.bump = ctx.bumps.referral;

    emit!(ReferralInitialized {
        referrer: referral.owner,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct ClaimReferralFees<'info> {
    #[account(mut)]
    pub referrer: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [REFERRAL_SEED, referrer.key().as_ref()],
        bump = referral.bump,
        constraint = referral.owner == referrer.key() @ LotteryError::Unauthorized,
    )]
    pub referral: Account<'info, Referral>,

    #[account(address = config.usdc_mint @ LotteryError::InvalidTokenMint)]
    pub usdc_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [PRIZE_VAULT_TOKEN_SEED, usdc_mint.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = prize_vault_authority,
    )]
    pub prize_vault: Account<'info, TokenAccount>,

    /// CHECK: PDA authority for prize_vault, signs the CPI transfer.
    #[account(seeds = [PRIZE_VAULT_AUTHORITY_SEED], bump = config.prize_vault_authority_bump)]
    pub prize_vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = referrer,
    )]
    pub referrer_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn claim_referral_fees(ctx: Context<ClaimReferralFees>) -> Result<()> {
    require!(
        !ctx.accounts.config.emergency_mode,
        LotteryError::EmergencyMode
    );
    let amount = ctx.accounts.referral.accrued;
    require!(amount > 0, LotteryError::NoReferralFees);

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
                mint: ctx.accounts.usdc_mint.to_account_info(),
                to: ctx.accounts.referrer_token_account.to_account_info(),
                authority: ctx.accounts.prize_vault_authority.to_account_info(),
            },
            signers,
        ),
        amount,
        ctx.accounts.usdc_mint.decimals,
    )?;

    ctx.accounts.referral.accrued = 0;

    emit!(ReferralFeesClaimed {
        referrer: ctx.accounts.referrer.key(),
        amount,
    });
    Ok(())
}
