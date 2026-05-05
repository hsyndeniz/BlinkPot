use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::{
    BPS_DENOM, CONFIG_SEED, LP_AUTHORITY_SEED, LP_PRINCIPAL_TOKEN_SEED, LP_VAULT_SEED,
    PRIZE_VAULT_AUTHORITY_SEED, PRIZE_VAULT_TOKEN_SEED, REFERRAL_SEED, ROUND_SEED, TICKET_SEED,
    TIER_COUNT,
};
use crate::errors::LotteryError;
use crate::events::{TierPoolsTallied, WinnerRegistered, WinningsClaimed};
use crate::math::{bps_amount, count_matches, tier_for_match};
use crate::state::config::{Config, UntakenTierDestination};
use crate::state::lp::LpVault;
use crate::state::referral::Referral;
use crate::state::round::{Round, RoundState};
use crate::state::ticket::Ticket;

fn register_ticket_for_round(round: &mut Round, ticket: &mut Ticket) -> Result<()> {
    require_eq!(ticket.round_id, round.round_id, LotteryError::RoundIdMismatch);
    require!(!ticket.registered, LotteryError::TicketAlreadyRegistered);

    let (matches, has_bonus) = count_matches(
        &ticket.normals,
        ticket.bonusball,
        &round.winning_normals,
        round.winning_bonusball,
    );
    let tier = tier_for_match(matches, has_bonus);
    ticket.tier = tier;
    ticket.registered = true;

    if tier > 0 {
        round.tier_winner_counts[tier as usize] = round.tier_winner_counts[tier as usize]
            .checked_add(1)
            .ok_or(error!(LotteryError::MathOverflow))?;
    }
    round.registered_count = round
        .registered_count
        .checked_add(1)
        .ok_or(error!(LotteryError::MathOverflow))?;

    if !matches!(round.state, RoundState::Registering) {
        round.state = RoundState::Registering;
    }

    emit!(WinnerRegistered {
        round_id: round.round_id,
        ticket_index: ticket.ticket_index,
        owner: ticket.owner,
        tier,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct RegisterWinner<'info> {
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
        seeds = [
            TICKET_SEED,
            &ticket.round_id.to_le_bytes(),
            ticket.owner.as_ref(),
            &ticket.ticket_index.to_le_bytes(),
        ],
        bump = ticket.bump,
    )]
    pub ticket: Box<Account<'info, Ticket>>,
}

pub fn register_winner(ctx: Context<RegisterWinner>) -> Result<()> {
    require!(!ctx.accounts.config.emergency_mode, LotteryError::EmergencyMode);

    let round = &mut ctx.accounts.round;
    let ticket = &mut ctx.accounts.ticket;

    require!(round.is_settled(), LotteryError::RoundNotSettled);
    require!(!round.tally_done, LotteryError::TicketAlreadyClaimed);

    register_ticket_for_round(round, ticket)
}

#[derive(Accounts)]
pub struct RegisterWinnersBatch<'info> {
    pub trigger: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    #[account(
        mut,
        seeds = [ROUND_SEED, &round.round_id.to_le_bytes()],
        bump = round.bump,
    )]
    pub round: Box<Account<'info, Round>>,
}

pub fn register_winners_batch<'info>(
    ctx: Context<'_, '_, 'info, 'info, RegisterWinnersBatch<'info>>,
) -> Result<()> {
    require!(!ctx.accounts.config.emergency_mode, LotteryError::EmergencyMode);

    let round = &mut ctx.accounts.round;
    require!(round.is_settled(), LotteryError::RoundNotSettled);
    require!(!round.tally_done, LotteryError::TicketAlreadyClaimed);

    for account_info in ctx.remaining_accounts.iter() {
        if !account_info.is_writable {
            continue;
        }

        if account_info.owner != &crate::ID {
            continue;
        }

        let mut data = account_info.try_borrow_mut_data()?;
        let mut data_slice: &[u8] = data.as_ref();
        let mut ticket = Ticket::try_deserialize(&mut data_slice)
            .map_err(|_| error!(LotteryError::InvalidConfig))?;

        if ticket.registered {
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

        register_ticket_for_round(round, &mut ticket)?;

        let mut writer = std::io::Cursor::new(data.as_mut());
        ticket
            .try_serialize(&mut writer)
            .map_err(|_| error!(LotteryError::InvalidConfig))?;
    }

    Ok(())
}

#[derive(Accounts)]
pub struct TallyTierPools<'info> {
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
    )]
    pub prize_vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: PDA authority for prize_vault, signs the CPI transfer.
    #[account(seeds = [PRIZE_VAULT_AUTHORITY_SEED], bump = config.prize_vault_authority_bump)]
    pub prize_vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [LP_PRINCIPAL_TOKEN_SEED, usdc_mint.key().as_ref()],
        bump,
    )]
    pub lp_principal: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn tally_tier_pools(ctx: Context<TallyTierPools>) -> Result<()> {
    require!(!ctx.accounts.config.emergency_mode, LotteryError::EmergencyMode);

    let round = &mut ctx.accounts.round;
    require!(
        matches!(round.state, RoundState::Settled | RoundState::Registering),
        LotteryError::RoundNotSettled
    );
    require!(!round.tally_done, LotteryError::TicketAlreadyClaimed);
    require!(
        round.registered_count == round.ticket_count,
        LotteryError::UnregisteredTicketsRemain
    );

    let prize_pool = round.prize_pool;
    let mut total_to_winners: u64 = 0;
    let mut untaken_tier_total: u64 = 0;
    let mut tier_pool_amounts = [0u64; TIER_COUNT];

    for t in 1..TIER_COUNT {
        let bps = ctx.accounts.config.tier_payout_bps[t];
        if bps == 0 {
            continue;
        }
        let pool_for_tier = bps_amount(prize_pool, bps)?;
        if round.tier_winner_counts[t] > 0 {
            tier_pool_amounts[t] = pool_for_tier;
            total_to_winners = total_to_winners
                .checked_add(pool_for_tier)
                .ok_or(error!(LotteryError::MathOverflow))?;
        } else {
            untaken_tier_total = untaken_tier_total
                .checked_add(pool_for_tier)
                .ok_or(error!(LotteryError::MathOverflow))?;
        }
    }

    let allocated = total_to_winners
        .checked_add(untaken_tier_total)
        .ok_or(error!(LotteryError::MathOverflow))?;
    let house_edge = prize_pool.saturating_sub(allocated);

    let to_lp_now = match ctx.accounts.config.untaken_tier_destination {
        UntakenTierDestination::LpPool => untaken_tier_total
            .checked_add(house_edge)
            .ok_or(error!(LotteryError::MathOverflow))?,
        UntakenTierDestination::NextRound => house_edge,
    };
    let to_next_round = match ctx.accounts.config.untaken_tier_destination {
        UntakenTierDestination::NextRound => untaken_tier_total,
        UntakenTierDestination::LpPool => 0,
    };

    if to_lp_now > 0 {
        let mint_key = ctx.accounts.usdc_mint.key();
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
                    to: ctx.accounts.lp_principal.to_account_info(),
                    authority: ctx.accounts.prize_vault_authority.to_account_info(),
                },
                signers,
            ),
            to_lp_now,
        )?;
        ctx.accounts.lp_vault.total_assets = ctx
            .accounts
            .lp_vault
            .total_assets
            .checked_add(to_lp_now)
            .ok_or(error!(LotteryError::MathOverflow))?;
        let _ = mint_key;
    }

    round.tier_pool_amounts = tier_pool_amounts;
    round.tally_done = true;
    round.rolled_to_lp = to_lp_now;
    round.rolled_to_next_round = to_next_round;
    round.state = RoundState::Claimable;

    emit!(TierPoolsTallied {
        round_id: round.round_id,
        tier_winner_counts: round.tier_winner_counts,
        tier_pool_amounts,
        rolled_to_lp: to_lp_now,
    });
    let _ = BPS_DENOM;
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

    pub token_program: Program<'info, Token>,
}

pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
    require!(!ctx.accounts.config.emergency_mode, LotteryError::EmergencyMode);

    let round = &mut ctx.accounts.round;
    let ticket = &mut ctx.accounts.ticket;

    require!(
        matches!(round.state, RoundState::Claimable | RoundState::Archived),
        LotteryError::RoundNotClaimable
    );
    require_eq!(ticket.round_id, round.round_id, LotteryError::RoundIdMismatch);
    require!(ticket.registered, LotteryError::TierNotTallied);
    require!(!ticket.claimed, LotteryError::TicketAlreadyClaimed);
    require!(ticket.tier > 0, LotteryError::NotAWinningTier);

    let tier = ticket.tier as usize;
    let pool = round.tier_pool_amounts[tier];
    let count = round.tier_winner_counts[tier] as u64;
    require!(count > 0, LotteryError::NoTierWinners);
    require!(pool > 0, LotteryError::TierNotTallied);

    let gross = pool / count;
    require!(gross > 0, LotteryError::TierNotTallied);

    let referral_amount = if ticket.has_referrer && ctx.accounts.referrer_account.is_some() {
        bps_amount(gross, ctx.accounts.config.referral_win_share_bps)?
    } else {
        0
    };
    let net_to_winner = gross
        .checked_sub(referral_amount)
        .ok_or(error!(LotteryError::MathOverflow))?;

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
                to: ctx.accounts.winner_token_account.to_account_info(),
                authority: ctx.accounts.prize_vault_authority.to_account_info(),
            },
            signers,
        ),
        net_to_winner,
    )?;

    if let Some(referrer_account) = ctx.accounts.referrer_account.as_mut() {
        require_keys_eq!(
            referrer_account.owner,
            ticket.referrer,
            LotteryError::InvalidConfig
        );
        referrer_account.accrued = referrer_account
            .accrued
            .checked_add(referral_amount)
            .ok_or(error!(LotteryError::MathOverflow))?;
        referrer_account.lifetime_earned = referrer_account
            .lifetime_earned
            .checked_add(referral_amount)
            .ok_or(error!(LotteryError::MathOverflow))?;
        round.referral_fees_accrued = round
            .referral_fees_accrued
            .checked_add(referral_amount)
            .ok_or(error!(LotteryError::MathOverflow))?;
    }

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
        referral_amount,
    });
    let _ = LP_AUTHORITY_SEED;
    Ok(())
}
