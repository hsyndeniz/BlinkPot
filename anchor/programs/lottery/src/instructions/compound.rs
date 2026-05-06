use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::constants::{
    BUYER_ENTRY_SEED, COMPOUND_STATE_SEED, CONFIG_SEED, LP_AUTHORITY_SEED, LP_PRINCIPAL_TOKEN_SEED,
    LP_VAULT_SEED, MAX_COMPOUND_TICKETS_PER_CALL, PRIZE_VAULT_AUTHORITY_SEED,
    PRIZE_VAULT_TOKEN_SEED, REFERRAL_SEED, ROUND_SEED, TICKET_SEED,
};
use crate::errors::LotteryError;
use crate::events::Compounded;
use crate::instructions::ticket::compute_per_ticket_fees;
use crate::math::validate_pick;
use crate::state::buyer_entry::BuyerEntry;
use crate::state::compound::CompoundState;
use crate::state::config::Config;
use crate::state::lp::LpVault;
use crate::state::referral::Referral;
use crate::state::round::{Round, RoundState};
use crate::state::ticket::{Ticket, TicketPick};

/// Compound winning tickets from a previously-claimable round into new tickets in
/// the currently-open round. Must be called by the ticket owner. Each Ticket account
/// in `remaining_accounts` is claimed (marked claimed, payout virtually moved to
/// `pending_usdc`); the resulting balance plus any prior remainder is used to mint
/// up to `tickets_to_buy` tickets in the open round.
///
/// The actual payout USDC stays inside `prize_vault` — we only update accounting.
/// The prize_vault then funds the new tickets' prize-pool contribution and lp_edge.
#[derive(Accounts)]
#[instruction(picks: Vec<TicketPick>, referrer: Option<Pubkey>)]
pub struct CompoundWinnings<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    /// The round currently open for buying.
    #[account(
        mut,
        seeds = [ROUND_SEED, &round.round_id.to_le_bytes()],
        bump = round.bump,
    )]
    pub round: Box<Account<'info, Round>>,

    /// The settled (Claimable) round whose winning tickets are being compounded.
    #[account(
        mut,
        seeds = [ROUND_SEED, &source_round.round_id.to_le_bytes()],
        bump = source_round.bump,
    )]
    pub source_round: Box<Account<'info, Round>>,

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

    /// CHECK: PDA authority for prize_vault, signs the LP edge transfer.
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
        seeds = [LP_PRINCIPAL_TOKEN_SEED, usdc_mint.key().as_ref()],
        bump,
        token::mint = usdc_mint,
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
    pub buyer_entry: Box<Account<'info, BuyerEntry>>,

    #[account(
        init_if_needed,
        payer = buyer,
        seeds = [COMPOUND_STATE_SEED, buyer.key().as_ref()],
        bump,
        space = 8 + CompoundState::LEN,
    )]
    pub compound_state: Box<Account<'info, CompoundState>>,

    #[account(mut)]
    pub referrer_account: Option<Box<Account<'info, Referral>>>,

    #[account(mut)]
    pub parent_referrer_account: Option<Box<Account<'info, Referral>>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn compound_winnings<'info>(
    ctx: Context<'_, '_, 'info, 'info, CompoundWinnings<'info>>,
    picks: Vec<TicketPick>,
    referrer: Option<Pubkey>,
) -> Result<()> {
    require!(!ctx.accounts.config.paused, LotteryError::Paused);
    require!(
        !ctx.accounts.config.emergency_mode,
        LotteryError::EmergencyMode
    );

    let new_count = picks.len();
    require!(
        new_count > 0 && new_count as u8 <= MAX_COMPOUND_TICKETS_PER_CALL,
        LotteryError::InvalidBatchSize
    );

    // Source round must be Claimable & tallied; new round must be Open & before draw.
    require!(
        matches!(
            ctx.accounts.source_round.state,
            RoundState::Claimable | RoundState::Archived
        ),
        LotteryError::RoundNotClaimable
    );
    require!(
        ctx.accounts.source_round.tally_done,
        LotteryError::RoundNotTallied
    );
    require!(ctx.accounts.round.is_open(), LotteryError::NoOpenRound);
    let now = Clock::get()?.unix_timestamp;
    require!(
        now < ctx.accounts.round.draw_time,
        LotteryError::DrawTimeNotReached
    );

    // Step 1 — claim all winning Ticket accounts in remaining_accounts.
    let buyer_key = ctx.accounts.buyer.key();
    let source_round_id = ctx.accounts.source_round.round_id;
    let mut tickets_claimed: u32 = 0;
    let mut usdc_claimed: u64 = 0;

    for ticket_account in ctx.remaining_accounts.iter() {
        if !ticket_account.is_writable {
            continue;
        }
        if ticket_account.owner != &crate::ID {
            continue;
        }
        let mut data = ticket_account.try_borrow_mut_data()?;
        let mut data_slice: &[u8] = data.as_ref();
        let mut ticket = match Ticket::try_deserialize(&mut data_slice) {
            Ok(t) => t,
            Err(_) => continue,
        };

        if ticket.round_id != source_round_id {
            continue;
        }
        require_keys_eq!(ticket.owner, buyer_key, LotteryError::Unauthorized);
        require!(!ticket.claimed, LotteryError::TicketAlreadyClaimed);
        require!(ticket.tallied, LotteryError::RoundNotTallied);
        require!(ticket.tier > 0, LotteryError::NotAWinningTier);

        // Verify the PDA address.
        let (expected_pda, _) = Pubkey::find_program_address(
            &[
                TICKET_SEED,
                &ticket.round_id.to_le_bytes(),
                ticket.owner.as_ref(),
                &ticket.ticket_index.to_le_bytes(),
            ],
            &crate::ID,
        );
        require_keys_eq!(
            ticket_account.key(),
            expected_pda,
            LotteryError::InvalidConfig
        );

        let tier = ticket.tier as usize;
        let pool = ctx.accounts.source_round.tier_pool_amounts[tier];
        let count = ctx.accounts.source_round.tier_winner_counts[tier] as u64;
        require!(count > 0 && pool > 0, LotteryError::NoTierWinners);
        let gross = pool / count;
        require!(gross > 0, LotteryError::NoTierWinners);

        // For the compound path we DO NOT pay referral win-shares on these claimed
        // tickets — referral fees apply to the *new* tickets' purchase, not the
        // re-invested winnings. This matches Megapot's TicketAutoCompoundVault model.
        ticket.claimed = true;
        usdc_claimed = usdc_claimed
            .checked_add(gross)
            .ok_or(error!(LotteryError::MathOverflow))?;
        tickets_claimed = tickets_claimed
            .checked_add(1)
            .ok_or(error!(LotteryError::MathOverflow))?;

        ctx.accounts.source_round.tier_paid_counts[tier] =
            ctx.accounts.source_round.tier_paid_counts[tier]
                .checked_add(1)
                .ok_or(error!(LotteryError::MathOverflow))?;
        ctx.accounts.source_round.tier_paid_amounts[tier] =
            ctx.accounts.source_round.tier_paid_amounts[tier]
                .checked_add(gross)
                .ok_or(error!(LotteryError::MathOverflow))?;
        ctx.accounts.source_round.claimed_count = ctx
            .accounts
            .source_round
            .claimed_count
            .checked_add(1)
            .ok_or(error!(LotteryError::MathOverflow))?;

        let mut writer = std::io::Cursor::new(data.as_mut());
        ticket
            .try_serialize(&mut writer)
            .map_err(|_| error!(LotteryError::InvalidConfig))?;
    }

    require!(tickets_claimed > 0, LotteryError::NoWinningTickets);

    // Step 2 — initialize compound_state if first time.
    let cs = &mut ctx.accounts.compound_state;
    if cs.owner == Pubkey::default() {
        cs.owner = buyer_key;
        cs.bump = ctx.bumps.compound_state;
    } else {
        require_keys_eq!(cs.owner, buyer_key, LotteryError::Unauthorized);
    }

    // Step 3 — total available = prior pending + winnings
    let mut available = cs
        .pending_usdc
        .checked_add(usdc_claimed)
        .ok_or(error!(LotteryError::MathOverflow))?;

    let ticket_price = ctx.accounts.round.ticket_price;
    let max_affordable = if ticket_price > 0 {
        (available / ticket_price) as u64
    } else {
        0
    };
    let to_buy = (new_count as u64).min(max_affordable) as usize;

    // Step 4 — referrer chain (mirrors buy_tickets).
    let (parent_referrer_pubkey, has_parent_referrer) = match referrer {
        Some(r) => {
            require_keys_neq!(r, buyer_key, LotteryError::SelfReferral);
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

    let normal_max = ctx.accounts.round.normal_ball_max;
    let bonus_max = ctx.accounts.round.bonusball_max;
    for i in 0..to_buy {
        validate_pick(&picks[i].normals, picks[i].bonusball, normal_max, bonus_max)?;
    }

    let mut usdc_spent: u64 = 0;
    let mut tickets_bought: u32 = 0;

    if to_buy > 0 {
        let total_paid = ticket_price
            .checked_mul(to_buy as u64)
            .ok_or(error!(LotteryError::MathOverflow))?;

        let fees = compute_per_ticket_fees(
            ticket_price,
            &ctx.accounts.config,
            referrer.is_some(),
            has_parent_referrer,
        )?;
        let lp_edge_total = fees
            .lp_edge
            .checked_mul(to_buy as u64)
            .ok_or(error!(LotteryError::MathOverflow))?;
        let referral_first_total = fees
            .referral_first
            .checked_mul(to_buy as u64)
            .ok_or(error!(LotteryError::MathOverflow))?;
        let referral_second_total = fees
            .referral_second
            .checked_mul(to_buy as u64)
            .ok_or(error!(LotteryError::MathOverflow))?;
        let ticket_prize_contribution = fees
            .prize_pool
            .checked_mul(to_buy as u64)
            .ok_or(error!(LotteryError::MathOverflow))?;

        // Mint tickets — same logic as buy_tickets but funded internally.
        let buyer_entry = &mut ctx.accounts.buyer_entry;
        if buyer_entry.round_id == 0 && buyer_entry.ticket_count == 0 {
            buyer_entry.round_id = ctx.accounts.round.round_id;
            buyer_entry.buyer = buyer_key;
            buyer_entry.bump = ctx.bumps.buyer_entry;
        } else {
            require_eq!(
                buyer_entry.round_id,
                ctx.accounts.round.round_id,
                LotteryError::RoundIdMismatch
            );
        }
        let first_index = buyer_entry.ticket_count;

        // ticket_accounts for new tickets are passed AFTER the winning tickets in remaining_accounts.
        let new_ticket_accounts =
            &ctx.remaining_accounts[ctx.remaining_accounts.len() - to_buy..];
        let rent = Rent::get()?;
        let space = 8 + Ticket::LEN;
        let lamports = rent.minimum_balance(space);
        let round_id_bytes = ctx.accounts.round.round_id.to_le_bytes();
        let program_id = ctx.program_id;

        for (i, ticket_account) in new_ticket_accounts.iter().enumerate() {
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
            system_program::create_account(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::CreateAccount {
                        from: ctx.accounts.buyer.to_account_info(),
                        to: ticket_account.clone(),
                    },
                    signers,
                ),
                lamports,
                space as u64,
                program_id,
            )?;

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
                tallied: false,
                claimed: false,
                tier: 0,
                bump,
            };
            let mut data = ticket_account.try_borrow_mut_data()?;
            let mut writer = std::io::Cursor::new(data.as_mut());
            ticket.try_serialize(&mut writer)?;
        }
        buyer_entry.ticket_count = first_index
            .checked_add(to_buy as u64)
            .ok_or(error!(LotteryError::MathOverflow))?;

        // Step 5 — fund the new tickets internally from prize_vault.
        // LP edge: prize_vault → lp_principal (signed by prize_vault_authority).
        let signer_seeds: &[&[u8]] = &[
            PRIZE_VAULT_AUTHORITY_SEED,
            &[ctx.accounts.config.prize_vault_authority_bump],
        ];
        let signers = &[signer_seeds];
        if lp_edge_total > 0 {
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
                lp_edge_total,
                ctx.accounts.usdc_mint.decimals,
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
        // Referral fees + prize_pool contribution stay in prize_vault — but we still
        // need to credit referrer accruals.
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

        let round = &mut ctx.accounts.round;
        round.referral_fees_accrued = round
            .referral_fees_accrued
            .checked_add(total_referrals)
            .ok_or(error!(LotteryError::MathOverflow))?;
        round.prize_pool = round
            .prize_pool
            .checked_add(ticket_prize_contribution)
            .ok_or(error!(LotteryError::MathOverflow))?;
        round.ticket_prize_pool = round
            .ticket_prize_pool
            .checked_add(ticket_prize_contribution)
            .ok_or(error!(LotteryError::MathOverflow))?;
        round.lp_edge_accrued = round
            .lp_edge_accrued
            .checked_add(lp_edge_total)
            .ok_or(error!(LotteryError::MathOverflow))?;
        round.ticket_count = round
            .ticket_count
            .checked_add(to_buy as u64)
            .ok_or(error!(LotteryError::MathOverflow))?;

        usdc_spent = total_paid;
        tickets_bought = to_buy as u32;
        available = available
            .checked_sub(total_paid)
            .ok_or(error!(LotteryError::MathOverflow))?;
    }

    // Step 6 — store remainder.
    let cs = &mut ctx.accounts.compound_state;
    cs.pending_usdc = available;
    cs.lifetime_compounded = cs
        .lifetime_compounded
        .checked_add(usdc_claimed)
        .ok_or(error!(LotteryError::MathOverflow))?;
    cs.lifetime_tickets = cs
        .lifetime_tickets
        .checked_add(tickets_bought as u64)
        .ok_or(error!(LotteryError::MathOverflow))?;

    emit!(Compounded {
        user: buyer_key,
        round_id: ctx.accounts.round.round_id,
        tickets_claimed,
        usdc_claimed,
        tickets_bought,
        usdc_spent,
        usdc_remaining: available,
    });
    Ok(())
}
