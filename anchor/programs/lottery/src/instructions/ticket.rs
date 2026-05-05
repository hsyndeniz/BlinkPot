use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::{
    BUYER_ENTRY_SEED, CONFIG_SEED, MAX_TICKETS_PER_BATCH, NORMAL_BALL_COUNT,
    PRIZE_VAULT_TOKEN_SEED, REFERRAL_SEED, ROUND_SEED, TICKET_SEED,
};
use crate::errors::LotteryError;
use crate::events::TicketsPurchased;
use crate::math::{bps_amount, validate_pick};
use crate::state::buyer_entry::BuyerEntry;
use crate::state::config::Config;
use crate::state::referral::Referral;
use crate::state::round::Round;
use crate::state::ticket::{Ticket, TicketPick};

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

    #[account(address = config.usdc_mint @ LotteryError::InvalidTokenMint)]
    pub usdc_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = buyer,
    )]
    pub buyer_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [PRIZE_VAULT_TOKEN_SEED, usdc_mint.key().as_ref()],
        bump,
    )]
    pub prize_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = buyer,
        seeds = [BUYER_ENTRY_SEED, &round.round_id.to_le_bytes(), buyer.key().as_ref()],
        bump,
        space = 8 + BuyerEntry::LEN,
    )]
    pub buyer_entry: Account<'info, BuyerEntry>,

    #[account(mut)]
    pub referrer_account: Option<Box<Account<'info, Referral>>>,

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
    require!(!ctx.accounts.config.emergency_mode, LotteryError::EmergencyMode);

    let count = picks.len();
    require!(
        count > 0 && count <= MAX_TICKETS_PER_BATCH,
        LotteryError::InvalidBatchSize
    );

    require!(
        ctx.accounts.round.is_open(),
        LotteryError::RoundNotOpen
    );
    let now = Clock::get()?.unix_timestamp;
    require!(now < ctx.accounts.round.draw_time, LotteryError::DrawTimeNotReached);

    let normal_max = ctx.accounts.round.normal_ball_max;
    let bonus_max = ctx.accounts.round.bonusball_max;
    for pick in picks.iter() {
        validate_pick(&pick.normals, pick.bonusball, normal_max, bonus_max)?;
    }

    if let Some(r) = referrer {
        require_keys_neq!(r, ctx.accounts.buyer.key(), LotteryError::SelfReferral);
        let ra = ctx
            .accounts
            .referrer_account
            .as_ref()
            .ok_or(error!(LotteryError::InvalidConfig))?;
        let (expected_pda, _) =
            Pubkey::find_program_address(&[REFERRAL_SEED, r.as_ref()], ctx.program_id);
        require_keys_eq!(ra.key(), expected_pda, LotteryError::InvalidConfig);
        require_keys_eq!(ra.owner, r, LotteryError::InvalidConfig);
    } else {
        require!(ctx.accounts.referrer_account.is_none(), LotteryError::InvalidConfig);
    }

    let ticket_price = ctx.accounts.round.ticket_price;
    let total_paid = ticket_price
        .checked_mul(count as u64)
        .ok_or(error!(LotteryError::MathOverflow))?;

    let referral_fee_per = if referrer.is_some() {
        bps_amount(ticket_price, ctx.accounts.config.referral_fee_bps)?
    } else {
        0
    };
    let referral_fee_total = referral_fee_per
        .checked_mul(count as u64)
        .ok_or(error!(LotteryError::MathOverflow))?;

    let lp_edge_per = bps_amount(ticket_price, ctx.accounts.config.lp_edge_bps)?;
    let lp_edge_total = lp_edge_per
        .checked_mul(count as u64)
        .ok_or(error!(LotteryError::MathOverflow))?;

    let pool_contribution = total_paid
        .checked_sub(referral_fee_total)
        .ok_or(error!(LotteryError::MathOverflow))?;

    let buyer_entry = &mut ctx.accounts.buyer_entry;
    if buyer_entry.round_id == 0 && buyer_entry.ticket_count == 0 {
        buyer_entry.round_id = ctx.accounts.round.round_id;
        buyer_entry.buyer = ctx.accounts.buyer.key();
        buyer_entry.bump = ctx.bumps.buyer_entry;
    } else {
        require_eq!(buyer_entry.round_id, ctx.accounts.round.round_id, LotteryError::RoundIdMismatch);
    }

    let first_index = buyer_entry.ticket_count;

    require_eq!(
        ctx.remaining_accounts.len(),
        count,
        LotteryError::InvalidBatchSize
    );

    let rent = Rent::get()?;
    let space = 8 + Ticket::LEN;
    let lamports = rent.minimum_balance(space);

    let round_id_bytes = ctx.accounts.round.round_id.to_le_bytes();
    let buyer_key = ctx.accounts.buyer.key();
    let program_id = ctx.program_id;

    for (i, ticket_account) in ctx.remaining_accounts.iter().enumerate() {
        let ticket_index = first_index
            .checked_add(i as u64)
            .ok_or(error!(LotteryError::MathOverflow))?;
        let idx_bytes = ticket_index.to_le_bytes();
        let (expected_pda, bump) = Pubkey::find_program_address(
            &[TICKET_SEED, &round_id_bytes, buyer_key.as_ref(), &idx_bytes],
            program_id,
        );
        require_keys_eq!(ticket_account.key(), expected_pda, LotteryError::InvalidConfig);

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
        let (referrer_pubkey, has_referrer) = match referrer {
            Some(r) => (r, true),
            None => (Pubkey::default(), false),
        };
        let ticket = Ticket {
            round_id: ctx.accounts.round.round_id,
            ticket_index,
            owner: buyer_key,
            buyer: buyer_key,
            referrer: referrer_pubkey,
            has_referrer,
            purchased_at: now,
            price_paid: ticket_price,
            normals: pick.normals,
            bonusball: pick.bonusball,
            registered: false,
            claimed: false,
            tier: 0,
            bump,
        };

        let mut data = ticket_account.try_borrow_mut_data()?;
        let mut writer = std::io::Cursor::new(data.as_mut());
        ticket.try_serialize(&mut writer)?;
    }

    buyer_entry.ticket_count = first_index
        .checked_add(count as u64)
        .ok_or(error!(LotteryError::MathOverflow))?;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.buyer_token_account.to_account_info(),
                to: ctx.accounts.prize_vault.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            },
        ),
        total_paid,
    )?;

    if let Some(r_account) = ctx.accounts.referrer_account.as_mut() {
        r_account.accrued = r_account
            .accrued
            .checked_add(referral_fee_total)
            .ok_or(error!(LotteryError::MathOverflow))?;
        r_account.lifetime_earned = r_account
            .lifetime_earned
            .checked_add(referral_fee_total)
            .ok_or(error!(LotteryError::MathOverflow))?;
        ctx.accounts.round.referral_fees_accrued = ctx
            .accounts
            .round
            .referral_fees_accrued
            .checked_add(referral_fee_total)
            .ok_or(error!(LotteryError::MathOverflow))?;
    }

    let round = &mut ctx.accounts.round;
    round.prize_pool = round
        .prize_pool
        .checked_add(pool_contribution)
        .ok_or(error!(LotteryError::MathOverflow))?;
    round.lp_edge_accrued = round
        .lp_edge_accrued
        .checked_add(lp_edge_total)
        .ok_or(error!(LotteryError::MathOverflow))?;
    round.ticket_count = round
        .ticket_count
        .checked_add(count as u64)
        .ok_or(error!(LotteryError::MathOverflow))?;

    let _ = NORMAL_BALL_COUNT;

    emit!(TicketsPurchased {
        round_id: round.round_id,
        buyer: buyer_key,
        count: count as u32,
        first_ticket_index: first_index,
        total_paid,
        referrer,
    });
    Ok(())
}
