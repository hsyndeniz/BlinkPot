use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::constants::{
    BUYER_ENTRY_SEED, CONFIG_SEED, LP_AUTHORITY_SEED, LP_PRINCIPAL_TOKEN_SEED, LP_VAULT_SEED,
    MAX_TICKETS_PER_BATCH, PICK_COUNTER_SEED, PRIZE_VAULT_AUTHORITY_SEED, PRIZE_VAULT_TOKEN_SEED,
    REFERRAL_SEED, ROUND_SEED, TICKET_SEED,
};
use crate::errors::LotteryError;
use crate::events::TicketsPurchased;
use crate::math::{bps_amount, validate_pick};
use crate::state::buyer_entry::BuyerEntry;
use crate::state::config::Config;
use crate::state::lp::LpVault;
use crate::state::pick_counter::PickCounter;
use crate::state::referral::Referral;
use crate::state::round::Round;
use crate::state::ticket::{Ticket, TicketPick};

/// Resolved per-ticket fee allocations (payment-mint base units, per single ticket).
pub(crate) struct PerTicketFees {
    pub lp_edge: u64,
    pub referral_first: u64,
    pub referral_second: u64,
    pub prize_pool: u64, // remainder credited to prize vault
}

/// Either creates a fresh `PickCounter` PDA for `(round_id, pick)` or increments the
/// existing one. The counter is the on-chain mechanism that prevents duplicate winning
/// tickets from over-drawing the prize pool: at claim time, the per-combo payout for a
/// tier is divided by `count`. Idempotent within a transaction — if the same pick PDA
/// is supplied multiple times in `remaining_accounts` (because a buyer purchased
/// several tickets with the same numbers), the first call creates and the rest
/// increment, which is exactly what we want.
pub(crate) fn upsert_pick_counter<'info>(
    pick_counter_account: &AccountInfo<'info>,
    pick: &TicketPick,
    round_id: u64,
    payer: &AccountInfo<'info>,
    system_program_ai: &AccountInfo<'info>,
    program_id: &Pubkey,
) -> Result<()> {
    let round_id_bytes = round_id.to_le_bytes();
    let bonus_byte = [pick.bonusball];
    let (expected_pda, bump) = Pubkey::find_program_address(
        &[
            PICK_COUNTER_SEED,
            &round_id_bytes,
            &pick.normals,
            &bonus_byte,
        ],
        program_id,
    );
    require_keys_eq!(
        pick_counter_account.key(),
        expected_pda,
        LotteryError::InvalidPickCounter
    );

    if pick_counter_account.data_is_empty() {
        // Fresh PDA — create + initialize.
        let space = 8 + PickCounter::LEN;
        let rent = Rent::get()?;
        let lamports = rent.minimum_balance(space);
        let signer_seeds: &[&[u8]] = &[
            PICK_COUNTER_SEED,
            &round_id_bytes,
            &pick.normals,
            &bonus_byte,
            &[bump],
        ];
        let signers = &[signer_seeds];
        system_program::create_account(
            CpiContext::new_with_signer(
                system_program_ai.clone(),
                system_program::CreateAccount {
                    from: payer.clone(),
                    to: pick_counter_account.clone(),
                },
                signers,
            ),
            lamports,
            space as u64,
            program_id,
        )?;

        let counter = PickCounter {
            initialized: true,
            round_id,
            normals: pick.normals,
            bonusball: pick.bonusball,
            count: 1,
            bump,
        };
        let mut data = pick_counter_account.try_borrow_mut_data()?;
        let mut writer = std::io::Cursor::new(data.as_mut());
        counter.try_serialize(&mut writer)?;
    } else {
        // Already initialized — must be owned by us, must match this round.
        require_keys_eq!(
            *pick_counter_account.owner,
            *program_id,
            LotteryError::InvalidPickCounter
        );
        let mut data = pick_counter_account.try_borrow_mut_data()?;
        let mut counter = PickCounter::try_deserialize(&mut data.as_ref())
            .map_err(|_| error!(LotteryError::InvalidPickCounter))?;
        require!(counter.initialized, LotteryError::InvalidPickCounter);
        require_eq!(counter.round_id, round_id, LotteryError::RoundIdMismatch);
        require!(
            counter.normals == pick.normals && counter.bonusball == pick.bonusball,
            LotteryError::InvalidPickCounter
        );
        counter.count = counter
            .count
            .checked_add(1)
            .ok_or(error!(LotteryError::MathOverflow))?;
        let mut writer = std::io::Cursor::new(data.as_mut());
        counter.try_serialize(&mut writer)?;
    }

    Ok(())
}

pub(crate) fn compute_per_ticket_fees(
    ticket_price: u64,
    config: &Config,
    has_referrer: bool,
    has_parent_referrer: bool,
) -> Result<PerTicketFees> {
    let lp_edge = bps_amount(ticket_price, config.lp_edge_bps)?;
    let referral_first = if has_referrer {
        bps_amount(ticket_price, config.referral_fee_first_bps)?
    } else {
        0
    };
    let referral_second = if has_parent_referrer {
        bps_amount(ticket_price, config.referral_fee_second_bps)?
    } else {
        0
    };
    let take = lp_edge
        .checked_add(referral_first)
        .and_then(|v| v.checked_add(referral_second))
        .ok_or(error!(LotteryError::MathOverflow))?;
    let prize_pool = ticket_price
        .checked_sub(take)
        .ok_or(error!(LotteryError::MathOverflow))?;
    Ok(PerTicketFees {
        lp_edge,
        referral_first,
        referral_second,
        prize_pool,
    })
}

#[derive(Accounts)]
#[instruction(picks: Vec<TicketPick>, referrer: Option<Pubkey>)]
pub struct BuyTickets<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    #[account(
        mut,
        seeds = [ROUND_SEED, &round.round_id.to_le_bytes()],
        bump = round.bump,
    )]
    pub round: Box<Account<'info, Round>>,

    #[account(address = config.payment_mint @ LotteryError::InvalidTokenMint)]
    pub payment_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        token::mint = payment_mint,
        token::authority = buyer,
    )]
    pub buyer_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [PRIZE_VAULT_TOKEN_SEED, payment_mint.key().as_ref()],
        bump,
        token::mint = payment_mint,
        token::authority = prize_vault_authority,
    )]
    pub prize_vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: PDA authority for prize_vault.
    #[account(seeds = [PRIZE_VAULT_AUTHORITY_SEED], bump = config.prize_vault_authority_bump)]
    pub prize_vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [LP_VAULT_SEED],
        bump = lp_vault.bump,
    )]
    pub lp_vault: Box<Account<'info, LpVault>>,

    /// CHECK: PDA authority for lp_principal.
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

    #[account(
        init_if_needed,
        payer = buyer,
        seeds = [BUYER_ENTRY_SEED, &round.round_id.to_le_bytes(), buyer.key().as_ref()],
        bump,
        space = 8 + BuyerEntry::LEN,
    )]
    pub buyer_entry: Account<'info, BuyerEntry>,

    /// First-order referrer's Referral PDA (required if `referrer` is Some).
    #[account(mut)]
    pub referrer_account: Option<Box<Account<'info, Referral>>>,

    /// Second-order referrer's Referral PDA. Required if first-order's `parent_referrer` is set.
    #[account(mut)]
    pub parent_referrer_account: Option<Box<Account<'info, Referral>>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn buy_tickets<'info>(
    ctx: Context<'_, '_, '_, 'info, BuyTickets<'info>>,
    picks: Vec<TicketPick>,
    referrer: Option<Pubkey>,
) -> Result<()> {
    require!(!ctx.accounts.config.paused, LotteryError::Paused);
    require!(
        !ctx.accounts.config.emergency_mode,
        LotteryError::EmergencyMode
    );

    let count = picks.len();
    require!(
        count > 0 && count <= MAX_TICKETS_PER_BATCH,
        LotteryError::InvalidBatchSize
    );

    require!(ctx.accounts.round.is_open(), LotteryError::RoundNotOpen);
    let now = Clock::get()?.unix_timestamp;
    require!(
        now < ctx.accounts.round.draw_time,
        LotteryError::DrawTimeNotReached
    );

    let normal_max = ctx.accounts.round.normal_ball_max;
    let bonus_max = ctx.accounts.round.bonusball_max;
    for pick in picks.iter() {
        validate_pick(&pick.normals, pick.bonusball, normal_max, bonus_max)?;
    }

    // Validate referrer chain.
    let (parent_referrer_pubkey, has_parent_referrer) = match referrer {
        Some(r) => {
            require_keys_neq!(r, ctx.accounts.buyer.key(), LotteryError::SelfReferral);
            let ra = ctx
                .accounts
                .referrer_account
                .as_ref()
                .ok_or(error!(LotteryError::ReferralRequired))?;
            let (expected_pda, _) =
                Pubkey::find_program_address(&[REFERRAL_SEED, r.as_ref()], ctx.program_id);
            require_keys_eq!(ra.key(), expected_pda, LotteryError::InvalidConfig);
            require_keys_eq!(ra.owner, r, LotteryError::InvalidConfig);

            if ra.has_parent {
                let parent = ctx
                    .accounts
                    .parent_referrer_account
                    .as_ref()
                    .ok_or(error!(LotteryError::ReferralRequired))?;
                let (expected_parent_pda, _) = Pubkey::find_program_address(
                    &[REFERRAL_SEED, ra.parent_referrer.as_ref()],
                    ctx.program_id,
                );
                require_keys_eq!(
                    parent.key(),
                    expected_parent_pda,
                    LotteryError::ParentReferrerMismatch
                );
                require_keys_eq!(
                    parent.owner,
                    ra.parent_referrer,
                    LotteryError::ParentReferrerMismatch
                );
                (ra.parent_referrer, true)
            } else {
                require!(
                    ctx.accounts.parent_referrer_account.is_none(),
                    LotteryError::InvalidConfig
                );
                (Pubkey::default(), false)
            }
        }
        None => {
            require!(
                ctx.accounts.referrer_account.is_none()
                    && ctx.accounts.parent_referrer_account.is_none(),
                LotteryError::InvalidConfig
            );
            (Pubkey::default(), false)
        }
    };

    let ticket_price = ctx.accounts.round.ticket_price;
    let total_paid = ticket_price
        .checked_mul(count as u64)
        .ok_or(error!(LotteryError::MathOverflow))?;

    let fees = compute_per_ticket_fees(
        ticket_price,
        &ctx.accounts.config,
        referrer.is_some(),
        has_parent_referrer,
    )?;

    let lp_edge_total = fees
        .lp_edge
        .checked_mul(count as u64)
        .ok_or(error!(LotteryError::MathOverflow))?;
    let referral_first_total = fees
        .referral_first
        .checked_mul(count as u64)
        .ok_or(error!(LotteryError::MathOverflow))?;
    let referral_second_total = fees
        .referral_second
        .checked_mul(count as u64)
        .ok_or(error!(LotteryError::MathOverflow))?;
    let ticket_prize_contribution = fees
        .prize_pool
        .checked_mul(count as u64)
        .ok_or(error!(LotteryError::MathOverflow))?;

    let buyer_entry = &mut ctx.accounts.buyer_entry;
    if !buyer_entry.initialized {
        buyer_entry.initialized = true;
        buyer_entry.round_id = ctx.accounts.round.round_id;
        buyer_entry.buyer = ctx.accounts.buyer.key();
        buyer_entry.bump = ctx.bumps.buyer_entry;
    } else {
        require_eq!(
            buyer_entry.round_id,
            ctx.accounts.round.round_id,
            LotteryError::RoundIdMismatch
        );
        require_keys_eq!(
            buyer_entry.buyer,
            ctx.accounts.buyer.key(),
            LotteryError::Unauthorized
        );
    }

    let first_index = buyer_entry.ticket_count;

    // remaining_accounts layout: first `count` entries are ticket PDAs (one per pick,
    // unique by ticket_index), followed by `count` PickCounter PDAs (one per pick — may
    // repeat if a buyer purchases duplicate picks; `upsert_pick_counter` handles that).
    require_eq!(
        ctx.remaining_accounts.len(),
        count.checked_mul(2).ok_or(error!(LotteryError::MathOverflow))?,
        LotteryError::InvalidBatchSize
    );
    let (ticket_accounts, pick_counter_accounts) = ctx.remaining_accounts.split_at(count);

    let rent = Rent::get()?;
    let space = 8 + Ticket::LEN;
    let lamports = rent.minimum_balance(space);

    let round_id_bytes = ctx.accounts.round.round_id.to_le_bytes();
    let buyer_key = ctx.accounts.buyer.key();
    let program_id = ctx.program_id;

    for (i, ticket_account) in ticket_accounts.iter().enumerate() {
        let ticket_index = first_index
            .checked_add(i as u64)
            .ok_or(error!(LotteryError::MathOverflow))?;
        let idx_bytes = ticket_index.to_le_bytes();
        let (expected_pda, bump) = Pubkey::find_program_address(
            &[TICKET_SEED, &round_id_bytes, buyer_key.as_ref(), &idx_bytes],
            program_id,
        );
        require_keys_eq!(
            ticket_account.key(),
            expected_pda,
            LotteryError::InvalidConfig
        );

        let signer_seeds: &[&[u8]] = &[
            TICKET_SEED,
            &round_id_bytes,
            buyer_key.as_ref(),
            &idx_bytes,
            &[bump],
        ];
        let signers = &[signer_seeds];
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::CreateAccount {
                from: ctx.accounts.buyer.to_account_info(),
                to: ticket_account.clone(),
            },
            signers,
        );
        system_program::create_account(cpi_ctx, lamports, space as u64, program_id)?;

        let pick = picks[i];
        let referrer_pubkey = referrer.unwrap_or(Pubkey::default());
        let ticket = Ticket {
            round_id: ctx.accounts.round.round_id,
            ticket_index,
            owner: buyer_key,
            buyer: buyer_key,
            referrer: referrer_pubkey,
            parent_referrer: parent_referrer_pubkey,
            has_referrer: referrer.is_some(),
            has_parent_referrer,
            purchased_at: now,
            price_paid: ticket_price,
            normals: pick.normals,
            bonusball: pick.bonusball,
            claimed: false,
            bump,
        };

        let mut data = ticket_account.try_borrow_mut_data()?;
        let mut writer = std::io::Cursor::new(data.as_mut());
        ticket.try_serialize(&mut writer)?;
    }

    // Upsert one PickCounter per ticket. Duplicates within the batch (same pick passed
    // multiple times) work correctly: the first hit creates, subsequent hits increment.
    for (i, pick_counter_account) in pick_counter_accounts.iter().enumerate() {
        upsert_pick_counter(
            pick_counter_account,
            &picks[i],
            ctx.accounts.round.round_id,
            &ctx.accounts.buyer.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            program_id,
        )?;
    }

    buyer_entry.ticket_count = first_index
        .checked_add(count as u64)
        .ok_or(error!(LotteryError::MathOverflow))?;

    // LP edge: payment tokens move from buyer → lp_principal.
    if lp_edge_total > 0 {
        token::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.buyer_token_account.to_account_info(),
                    mint: ctx.accounts.payment_mint.to_account_info(),
                    to: ctx.accounts.lp_principal.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            lp_edge_total,
            ctx.accounts.config.payment_decimals,
        )?;
        let lp_vault = &mut ctx.accounts.lp_vault;
        lp_vault.total_assets = lp_vault
            .total_assets
            .checked_add(lp_edge_total)
            .ok_or(error!(LotteryError::MathOverflow))?;
        lp_vault.lifetime_edge_earned = lp_vault
            .lifetime_edge_earned
            .checked_add(lp_edge_total)
            .ok_or(error!(LotteryError::MathOverflow))?;
    }

    // Everything else (referral fees + prize pool contribution) goes to prize_vault.
    // Referral fees are accrued in referrer PDAs and only leave the vault when claimed.
    let prize_vault_amount = total_paid
        .checked_sub(lp_edge_total)
        .ok_or(error!(LotteryError::MathOverflow))?;
    if prize_vault_amount > 0 {
        token::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.buyer_token_account.to_account_info(),
                    mint: ctx.accounts.payment_mint.to_account_info(),
                    to: ctx.accounts.prize_vault.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            prize_vault_amount,
            ctx.accounts.config.payment_decimals,
        )?;
    }

    if let Some(r_account) = ctx.accounts.referrer_account.as_mut() {
        r_account.accrued = r_account
            .accrued
            .checked_add(referral_first_total)
            .ok_or(error!(LotteryError::MathOverflow))?;
        r_account.lifetime_earned_first = r_account
            .lifetime_earned_first
            .checked_add(referral_first_total)
            .ok_or(error!(LotteryError::MathOverflow))?;
    }

    if let Some(p_account) = ctx.accounts.parent_referrer_account.as_mut() {
        p_account.accrued = p_account
            .accrued
            .checked_add(referral_second_total)
            .ok_or(error!(LotteryError::MathOverflow))?;
        p_account.lifetime_earned_second = p_account
            .lifetime_earned_second
            .checked_add(referral_second_total)
            .ok_or(error!(LotteryError::MathOverflow))?;
    }

    let total_referrals = referral_first_total
        .checked_add(referral_second_total)
        .ok_or(error!(LotteryError::MathOverflow))?;
    ctx.accounts.round.referral_fees_accrued = ctx
        .accounts
        .round
        .referral_fees_accrued
        .checked_add(total_referrals)
        .ok_or(error!(LotteryError::MathOverflow))?;

    let round = &mut ctx.accounts.round;
    round.prize_pool = round
        .prize_pool
        .checked_add(ticket_prize_contribution)
        .ok_or(error!(LotteryError::MathOverflow))?;
    round.lp_edge_accrued = round
        .lp_edge_accrued
        .checked_add(lp_edge_total)
        .ok_or(error!(LotteryError::MathOverflow))?;
    round.ticket_count = round
        .ticket_count
        .checked_add(count as u64)
        .ok_or(error!(LotteryError::MathOverflow))?;

    emit!(TicketsPurchased {
        round_id: round.round_id,
        buyer: buyer_key,
        count: count as u32,
        first_ticket_index: first_index,
        total_paid,
        referrer,
        parent_referrer: if has_parent_referrer {
            Some(parent_referrer_pubkey)
        } else {
            None
        },
    });
    Ok(())
}
