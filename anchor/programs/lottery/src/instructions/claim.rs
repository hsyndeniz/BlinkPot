use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::constants::{
    CONFIG_SEED, PICK_COUNTER_SEED, PRIZE_VAULT_AUTHORITY_SEED, PRIZE_VAULT_TOKEN_SEED,
    REFERRAL_SEED, ROUND_SEED, TICKET_SEED,
};
use crate::errors::LotteryError;
use crate::events::WinningsClaimed;
use crate::math::{bps_amount, count_matches, tier_for_match};
use crate::state::config::Config;
use crate::state::pick_counter::PickCounter;
use crate::state::referral::Referral;
use crate::state::round::{Round, RoundState};
use crate::state::ticket::Ticket;

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
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

    /// Counter for the (round, pick) the ticket holds. Created at buy time; read-only at
    /// claim time. The counter's `count` is the divisor that ensures duplicate winners on
    /// a shared pick split that pick's allocation evenly instead of each receiving the
    /// full per-combo amount.
    #[account(
        seeds = [
            PICK_COUNTER_SEED,
            &ticket.round_id.to_le_bytes(),
            &ticket.normals,
            &[ticket.bonusball],
        ],
        bump = pick_counter.bump,
        constraint = pick_counter.round_id == ticket.round_id @ LotteryError::InvalidPickCounter,
    )]
    pub pick_counter: Box<Account<'info, PickCounter>>,

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
        token::mint = payment_mint,
        token::authority = owner,
    )]
    pub winner_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [REFERRAL_SEED, ticket.referrer.as_ref()],
        bump,
    )]
    pub referrer_account: Option<Box<Account<'info, Referral>>>,

    #[account(
        mut,
        seeds = [REFERRAL_SEED, ticket.parent_referrer.as_ref()],
        bump,
    )]
    pub parent_referrer_account: Option<Box<Account<'info, Referral>>>,

    pub token_program: Program<'info, Token>,
}

pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
    require!(
        !ctx.accounts.config.emergency_mode,
        LotteryError::EmergencyMode
    );

    let round = &mut ctx.accounts.round;
    let ticket = &mut ctx.accounts.ticket;
    let pick_counter = &ctx.accounts.pick_counter;

    require!(
        matches!(round.state, RoundState::Claimable | RoundState::Archived),
        LotteryError::RoundNotClaimable
    );
    require_eq!(
        ticket.round_id,
        round.round_id,
        LotteryError::RoundIdMismatch
    );
    require!(!ticket.claimed, LotteryError::TicketAlreadyClaimed);

    // Compute tier from the ticket's pick + the round's winning numbers. No
    // intermediate registration step exists — claim directly verifies the win.
    let (matches, has_bonus) = count_matches(
        &ticket.normals,
        ticket.bonusball,
        &round.winning_normals,
        round.winning_bonusball,
    );
    let tier = tier_for_match(matches, has_bonus) as usize;
    require!(
        tier < round.tier_is_winning.len(),
        LotteryError::NotAWinningTier
    );
    require!(round.tier_is_winning[tier], LotteryError::NotAWinningTier);

    let per_combo = round.per_combo_payout[tier];
    require!(per_combo > 0, LotteryError::NoTierWinners);

    // Counter is incremented at buy-time for every ticket that shares this pick. So
    // `count >= 1` for any legitimately-purchased ticket. Divide the per-combo payout
    // by the actual ticket count to split the allocation among duplicate winners.
    require!(pick_counter.count > 0, LotteryError::InvalidPickCounter);
    let counter = pick_counter.count as u64;
    let gross = per_combo / counter;
    require!(gross > 0, LotteryError::NoTierWinners);

    let referral_first_amount = if ticket.has_referrer {
        let r = ctx
            .accounts
            .referrer_account
            .as_ref()
            .ok_or(error!(LotteryError::ReferralRequired))?;
        require_keys_eq!(r.owner, ticket.referrer, LotteryError::InvalidConfig);
        bps_amount(gross, ctx.accounts.config.referral_win_share_first_bps)?
    } else {
        require!(
            ctx.accounts.referrer_account.is_none(),
            LotteryError::InvalidConfig
        );
        0
    };

    let referral_second_amount = if ticket.has_parent_referrer {
        let p = ctx
            .accounts
            .parent_referrer_account
            .as_ref()
            .ok_or(error!(LotteryError::ReferralRequired))?;
        require_keys_eq!(
            p.owner,
            ticket.parent_referrer,
            LotteryError::ParentReferrerMismatch
        );
        bps_amount(gross, ctx.accounts.config.referral_win_share_second_bps)?
    } else {
        require!(
            ctx.accounts.parent_referrer_account.is_none(),
            LotteryError::InvalidConfig
        );
        0
    };

    let total_referral = referral_first_amount
        .checked_add(referral_second_amount)
        .ok_or(error!(LotteryError::MathOverflow))?;
    let net_to_winner = gross
        .checked_sub(total_referral)
        .ok_or(error!(LotteryError::MathOverflow))?;

    let signer_seeds: &[&[u8]] = &[
        PRIZE_VAULT_AUTHORITY_SEED,
        &[ctx.accounts.config.prize_vault_authority_bump],
    ];
    let signers = &[signer_seeds];

    if net_to_winner > 0 {
        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.prize_vault.to_account_info(),
                    mint: ctx.accounts.payment_mint.to_account_info(),
                    to: ctx.accounts.winner_token_account.to_account_info(),
                    authority: ctx.accounts.prize_vault_authority.to_account_info(),
                },
                signers,
            ),
            net_to_winner,
            ctx.accounts.config.payment_decimals,
        )?;
    }

    if let Some(referrer_account) = ctx.accounts.referrer_account.as_mut() {
        referrer_account.accrued = referrer_account
            .accrued
            .checked_add(referral_first_amount)
            .ok_or(error!(LotteryError::MathOverflow))?;
        referrer_account.lifetime_earned_first = referrer_account
            .lifetime_earned_first
            .checked_add(referral_first_amount)
            .ok_or(error!(LotteryError::MathOverflow))?;
    }

    if let Some(p_account) = ctx.accounts.parent_referrer_account.as_mut() {
        p_account.accrued = p_account
            .accrued
            .checked_add(referral_second_amount)
            .ok_or(error!(LotteryError::MathOverflow))?;
        p_account.lifetime_earned_second = p_account
            .lifetime_earned_second
            .checked_add(referral_second_amount)
            .ok_or(error!(LotteryError::MathOverflow))?;
    }

    round.referral_fees_accrued = round
        .referral_fees_accrued
        .checked_add(total_referral)
        .ok_or(error!(LotteryError::MathOverflow))?;

    ticket.claimed = true;
    round.tier_paid_counts[tier] = round.tier_paid_counts[tier]
        .checked_add(1)
        .ok_or(error!(LotteryError::MathOverflow))?;
    round.tier_paid_amounts[tier] = round.tier_paid_amounts[tier]
        .checked_add(gross)
        .ok_or(error!(LotteryError::MathOverflow))?;
    round.claimed_count = round
        .claimed_count
        .checked_add(1)
        .ok_or(error!(LotteryError::MathOverflow))?;

    emit!(WinningsClaimed {
        round_id: round.round_id,
        ticket_index: ticket.ticket_index,
        owner: ticket.owner,
        tier: tier as u8,
        amount: net_to_winner,
        referral_first_amount,
        referral_second_amount,
    });
    Ok(())
}
