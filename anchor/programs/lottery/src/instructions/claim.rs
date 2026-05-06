use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::constants::{
    CONFIG_SEED, LP_AUTHORITY_SEED, LP_PRINCIPAL_TOKEN_SEED, LP_VAULT_SEED,
    PRIZE_VAULT_AUTHORITY_SEED, PRIZE_VAULT_TOKEN_SEED, REFERRAL_SEED, ROUND_SEED, TICKET_SEED,
};
use crate::errors::LotteryError;
use crate::events::{LpVaultMarked, RoundTallied, WinningsClaimed};
use crate::math::{
    bps_amount, calculate_tally_outcome, count_matches, share_price_q, tier_for_match,
};
use crate::state::config::Config;
use crate::state::lp::LpVault;
use crate::state::referral::Referral;
use crate::state::round::{Round, RoundState};
use crate::state::ticket::Ticket;

/// `tally_round` collapses the old register + tally flow into a single permissionless
/// keeper-driven instruction. It accepts winning Ticket PDAs in `remaining_accounts`,
/// scans them once to set `ticket.tier` and increment `round.tier_winner_counts`, and —
/// when called with `finalize: true` — computes `tier_pool_amounts`, executes any
/// guarantee/rollover transfers, and transitions the round to `Claimable`.
///
/// Multiple chunked calls are allowed; only the final one needs `finalize = true`.
#[derive(Accounts)]
pub struct TallyRound<'info> {
    pub trigger: Signer<'info>,

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
        seeds = [LP_VAULT_SEED],
        bump = lp_vault.bump,
    )]
    pub lp_vault: Box<Account<'info, LpVault>>,

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
        seeds = [LP_PRINCIPAL_TOKEN_SEED, usdc_mint.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = lp_authority,
    )]
    pub lp_principal: Box<Account<'info, TokenAccount>>,

    /// CHECK: PDA authority for lp_principal.
    #[account(seeds = [LP_AUTHORITY_SEED], bump = config.lp_authority_bump)]
    pub lp_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn tally_round<'info>(
    ctx: Context<'_, '_, 'info, 'info, TallyRound<'info>>,
    finalize: bool,
) -> Result<()> {
    require!(
        !ctx.accounts.config.emergency_mode,
        LotteryError::EmergencyMode
    );

    let round = &mut ctx.accounts.round;
    require!(round.is_settled(), LotteryError::RoundNotSettled);
    require!(!round.tally_done, LotteryError::RoundAlreadyTallied);

    let mut tickets_processed: u32 = 0;
    for account_info in ctx.remaining_accounts.iter() {
        if !account_info.is_writable {
            continue;
        }
        if account_info.owner != &crate::ID {
            continue;
        }

        let mut data = account_info.try_borrow_mut_data()?;
        let mut data_slice: &[u8] = data.as_ref();
        let mut ticket = match Ticket::try_deserialize(&mut data_slice) {
            Ok(t) => t,
            Err(_) => continue,
        };
        if ticket.tallied {
            continue;
        }
        if ticket.round_id != round.round_id {
            continue;
        }

        let (expected_pda, _) = Pubkey::find_program_address(
            &[
                TICKET_SEED,
                &ticket.round_id.to_le_bytes(),
                ticket.owner.as_ref(),
                &ticket.ticket_index.to_le_bytes(),
            ],
            &crate::ID,
        );
        if expected_pda != *account_info.key {
            continue;
        }

        let (matches, has_bonus) = count_matches(
            &ticket.normals,
            ticket.bonusball,
            &round.winning_normals,
            round.winning_bonusball,
        );
        let tier = tier_for_match(matches, has_bonus);
        ticket.tier = tier;
        ticket.tallied = true;
        if tier > 0 {
            round.tier_winner_counts[tier as usize] = round.tier_winner_counts[tier as usize]
                .checked_add(1)
                .ok_or(error!(LotteryError::MathOverflow))?;
        }
        tickets_processed = tickets_processed
            .checked_add(1)
            .ok_or(error!(LotteryError::MathOverflow))?;

        let mut writer = std::io::Cursor::new(data.as_mut());
        ticket
            .try_serialize(&mut writer)
            .map_err(|_| error!(LotteryError::InvalidConfig))?;
    }

    if !finalize {
        emit!(RoundTallied {
            round_id: round.round_id,
            tier_winner_counts: round.tier_winner_counts,
            tier_pool_amounts: round.tier_pool_amounts,
            rolled_to_lp: 0,
            rolled_to_next_round: 0,
            lp_loss_reserved: 0,
            tickets_processed,
            finalized: false,
            used_minimum_payouts: false,
        });
        return Ok(());
    }

    // Finalize: compute tier_pool_amounts, settle LP guarantees & rollovers.
    let outcome = calculate_tally_outcome(
        round.prize_pool,
        round.seed_prize_pool,
        round.ticket_prize_pool,
        round.lp_guarantee_reserved,
        &round.tier_winner_counts,
        &round.tier_premium_weight_bps,
        &round.tier_min_payout_per_winner,
        round.premium_min_allocation_bps,
        ctx.accounts.config.untaken_tier_destination,
    )?;

    let lp_vault = &mut ctx.accounts.lp_vault;
    if outcome.lp_loss_reserved > 0 {
        lp_vault.total_assets = lp_vault
            .total_assets
            .checked_sub(outcome.lp_loss_reserved)
            .ok_or(error!(LotteryError::MathOverflow))?;
        lp_vault.lifetime_jackpot_loss = lp_vault
            .lifetime_jackpot_loss
            .checked_add(outcome.lp_loss_reserved)
            .ok_or(error!(LotteryError::MathOverflow))?;
    }

    let to_lp_now = outcome
        .unused_guarantee
        .checked_add(outcome.rolled_to_lp)
        .ok_or(error!(LotteryError::MathOverflow))?;

    if to_lp_now > 0 {
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
                    to: ctx.accounts.lp_principal.to_account_info(),
                    authority: ctx.accounts.prize_vault_authority.to_account_info(),
                },
                signers,
            ),
            to_lp_now,
            ctx.accounts.usdc_mint.decimals,
        )?;
        if outcome.rolled_to_lp > 0 {
            lp_vault.total_assets = lp_vault
                .total_assets
                .checked_add(outcome.rolled_to_lp)
                .ok_or(error!(LotteryError::MathOverflow))?;
        }
    }

    round.tier_pool_amounts = outcome.tier_pool_amounts;
    round.tally_done = true;
    round.rolled_to_lp = outcome.rolled_to_lp;
    round.rolled_to_next_round = outcome.rolled_to_next_round;
    round.lp_loss_reserved = outcome.lp_loss_reserved;
    round.player_funded_prizes = outcome.player_funded_prizes;
    round.min_payouts_total = outcome.min_payouts_total;
    round.premium_payouts_total = outcome.premium_payouts_total;
    round.used_minimum_payouts = outcome.used_minimum_payouts;
    round.state = RoundState::Claimable;

    emit!(RoundTallied {
        round_id: round.round_id,
        tier_winner_counts: round.tier_winner_counts,
        tier_pool_amounts: outcome.tier_pool_amounts,
        rolled_to_lp: outcome.rolled_to_lp,
        rolled_to_next_round: outcome.rolled_to_next_round,
        lp_loss_reserved: outcome.lp_loss_reserved,
        tickets_processed,
        finalized: true,
        used_minimum_payouts: outcome.used_minimum_payouts,
    });
    emit!(LpVaultMarked {
        total_shares: lp_vault.total_shares,
        total_assets: lp_vault.total_assets,
        share_price_q: share_price_q(lp_vault.total_shares, lp_vault.total_assets),
        lifetime_edge_earned: lp_vault.lifetime_edge_earned,
        lifetime_jackpot_loss: lp_vault.lifetime_jackpot_loss,
    });
    Ok(())
}

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
        token::mint = usdc_mint,
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

    require!(
        matches!(round.state, RoundState::Claimable | RoundState::Archived),
        LotteryError::RoundNotClaimable
    );
    require_eq!(
        ticket.round_id,
        round.round_id,
        LotteryError::RoundIdMismatch
    );
    require!(round.tally_done, LotteryError::RoundNotTallied);
    require!(ticket.tallied, LotteryError::RoundNotTallied);
    require!(!ticket.claimed, LotteryError::TicketAlreadyClaimed);
    require!(ticket.tier > 0, LotteryError::NotAWinningTier);

    let tier = ticket.tier as usize;
    let pool = round.tier_pool_amounts[tier];
    let count = round.tier_winner_counts[tier] as u64;
    require!(count > 0, LotteryError::NoTierWinners);
    require!(pool > 0, LotteryError::NoTierWinners);

    let gross = pool / count;
    require!(gross > 0, LotteryError::NoTierWinners);

    // Referral payouts at claim time: first-order + optional second-order.
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
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.winner_token_account.to_account_info(),
                    authority: ctx.accounts.prize_vault_authority.to_account_info(),
                },
                signers,
            ),
            net_to_winner,
            ctx.accounts.usdc_mint.decimals,
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
        tier: ticket.tier,
        amount: net_to_winner,
        referral_first_amount,
        referral_second_amount,
    });
    let _ = LP_AUTHORITY_SEED;
    Ok(())
}
