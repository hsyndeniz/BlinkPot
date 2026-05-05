use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::constants::{
    BUYER_ENTRY_SEED, CONFIG_SEED, LP_AUTHORITY_SEED, LP_PRINCIPAL_TOKEN_SEED, LP_VAULT_SEED,
    MAX_DAILY_TICKETS_PER_SUB, MAX_DAYS_PER_SUBSCRIPTION, MAX_TICKETS_PER_BATCH,
    PRIZE_VAULT_AUTHORITY_SEED, PRIZE_VAULT_TOKEN_SEED, REFERRAL_SEED, ROUND_SEED,
    SUBSCRIPTION_SEED, SUB_ESCROW_SEED, TICKET_SEED,
};
use crate::errors::LotteryError;
use crate::events::{SubscriptionCanceled, SubscriptionCreated, SubscriptionProcessed};
use crate::math::{bps_amount, validate_pick};
use crate::state::buyer_entry::BuyerEntry;
use crate::state::config::Config;
use crate::state::lp::LpVault;
use crate::state::referral::Referral;
use crate::state::round::Round;
use crate::state::subscription::Subscription;
use crate::state::ticket::{Ticket, TicketPick};

#[derive(Accounts)]
pub struct SubscribeDaily<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    #[account(
        init_if_needed,
        payer = owner,
        seeds = [SUBSCRIPTION_SEED, owner.key().as_ref()],
        bump,
        space = 8 + Subscription::LEN,
    )]
    pub subscription: Box<Account<'info, Subscription>>,

    #[account(address = config.usdc_mint @ LotteryError::InvalidTokenMint)]
    pub usdc_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = owner,
    )]
    pub owner_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = owner,
        seeds = [SUB_ESCROW_SEED, owner.key().as_ref(), usdc_mint.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = subscription,
    )]
    pub sub_escrow: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub referrer_account: Option<Box<Account<'info, Referral>>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn subscribe_daily(
    ctx: Context<SubscribeDaily>,
    daily_ticket_count: u8,
    days: u16,
    referrer: Option<Pubkey>,
) -> Result<()> {
    require!(!ctx.accounts.config.paused, LotteryError::Paused);
    require!(
        !ctx.accounts.config.emergency_mode,
        LotteryError::EmergencyMode
    );
    require!(
        daily_ticket_count > 0 && daily_ticket_count <= MAX_DAILY_TICKETS_PER_SUB,
        LotteryError::InvalidSubscription
    );
    require!(
        days > 0 && days <= MAX_DAYS_PER_SUBSCRIPTION,
        LotteryError::InvalidSubscription
    );

    if let Some(r) = referrer {
        require_keys_neq!(r, ctx.accounts.owner.key(), LotteryError::SelfReferral);
        let ra = ctx
            .accounts
            .referrer_account
            .as_ref()
            .ok_or(error!(LotteryError::ReferralRequired))?;
        let (expected_pda, _) =
            Pubkey::find_program_address(&[REFERRAL_SEED, r.as_ref()], ctx.program_id);
        require_keys_eq!(ra.key(), expected_pda, LotteryError::InvalidConfig);
        require_keys_eq!(ra.owner, r, LotteryError::InvalidConfig);
    } else {
        require!(
            ctx.accounts.referrer_account.is_none(),
            LotteryError::InvalidConfig
        );
    }

    // Re-create path safety: this instruction may run against an existing
    // subscription PDA (init_if_needed). Only allow if not active and the
    // tracked escrow balance is zero.
    if ctx.accounts.subscription.owner != Pubkey::default() {
        require_keys_eq!(
            ctx.accounts.subscription.owner,
            ctx.accounts.owner.key(),
            LotteryError::Unauthorized
        );
        require!(
            !ctx.accounts.subscription.active,
            LotteryError::InvalidSubscription
        );
        require!(
            ctx.accounts.subscription.escrow_balance == 0,
            LotteryError::InvalidSubscription
        );
    }

    let agreed_price = ctx.accounts.config.default_ticket_price;
    require!(agreed_price > 0, LotteryError::InvalidTicketPrice);

    let total_amount = (daily_ticket_count as u64)
        .checked_mul(days as u64)
        .and_then(|n| n.checked_mul(agreed_price))
        .ok_or(error!(LotteryError::MathOverflow))?;

    token::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.owner_token_account.to_account_info(),
                mint: ctx.accounts.usdc_mint.to_account_info(),
                to: ctx.accounts.sub_escrow.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        total_amount,
        ctx.accounts.usdc_mint.decimals,
    )?;

    let now = Clock::get()?.unix_timestamp;
    let expires_at = now.saturating_add((days as i64).saturating_mul(24 * 60 * 60));

    let subscription = &mut ctx.accounts.subscription;
    subscription.owner = ctx.accounts.owner.key();
    subscription.daily_ticket_count = daily_ticket_count;
    subscription.agreed_price = agreed_price;
    subscription.remaining_days = days;
    subscription.last_processed_round = 0;
    subscription.expires_at = expires_at;
    subscription.referrer = referrer.unwrap_or(Pubkey::default());
    subscription.has_referrer = referrer.is_some();
    subscription.active = true;
    subscription.escrow_balance = total_amount;
    subscription.bump = ctx.bumps.subscription;
    subscription.escrow_bump = ctx.bumps.sub_escrow;

    emit!(SubscriptionCreated {
        owner: subscription.owner,
        daily_ticket_count,
        agreed_price,
        expires_at,
    });
    Ok(())
}

#[derive(Accounts)]
#[instruction(picks: Vec<TicketPick>)]
pub struct ProcessSubscription<'info> {
    #[account(mut)]
    pub keeper: Signer<'info>,

    /// CHECK: subscription owner; tickets are minted to this owner.
    pub owner: UncheckedAccount<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    #[account(
        mut,
        seeds = [SUBSCRIPTION_SEED, owner.key().as_ref()],
        bump = subscription.bump,
        constraint = subscription.owner == owner.key() @ LotteryError::Unauthorized,
    )]
    pub subscription: Box<Account<'info, Subscription>>,

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
        seeds = [SUB_ESCROW_SEED, owner.key().as_ref(), usdc_mint.key().as_ref()],
        bump = subscription.escrow_bump,
        token::mint = usdc_mint,
        token::authority = subscription,
    )]
    pub sub_escrow: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [PRIZE_VAULT_TOKEN_SEED, usdc_mint.key().as_ref()],
        bump,
        token::mint = usdc_mint,
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
        seeds = [LP_PRINCIPAL_TOKEN_SEED, usdc_mint.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = lp_authority,
    )]
    pub lp_principal: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = keeper,
        seeds = [BUYER_ENTRY_SEED, &round.round_id.to_le_bytes(), owner.key().as_ref()],
        bump,
        space = 8 + BuyerEntry::LEN,
    )]
    pub buyer_entry: Box<Account<'info, BuyerEntry>>,

    #[account(mut)]
    pub referrer_account: Option<Box<Account<'info, Referral>>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn process_subscription<'info>(
    ctx: Context<'_, '_, '_, 'info, ProcessSubscription<'info>>,
    picks: Vec<TicketPick>,
) -> Result<()> {
    require!(!ctx.accounts.config.paused, LotteryError::Paused);
    require!(
        !ctx.accounts.config.emergency_mode,
        LotteryError::EmergencyMode
    );

    let subscription = &mut ctx.accounts.subscription;
    require!(subscription.active, LotteryError::SubscriptionInactive);

    let now = Clock::get()?.unix_timestamp;
    require!(
        now < subscription.expires_at,
        LotteryError::SubscriptionInactive
    );
    require!(
        subscription.remaining_days > 0,
        LotteryError::SubscriptionInactive
    );

    let round = &mut ctx.accounts.round;
    require!(round.is_open(), LotteryError::RoundNotOpen);
    require!(now < round.draw_time, LotteryError::DrawTimeNotReached);
    require!(
        round.round_id > subscription.last_processed_round,
        LotteryError::SubscriptionAlreadyProcessed
    );

    if subscription.agreed_price != round.ticket_price {
        subscription.active = false;
        return Err(error!(LotteryError::SubscriptionPriceChanged));
    }

    if subscription.has_referrer {
        let ra = ctx
            .accounts
            .referrer_account
            .as_ref()
            .ok_or(error!(LotteryError::ReferralRequired))?;
        let (expected_pda, _) = Pubkey::find_program_address(
            &[REFERRAL_SEED, subscription.referrer.as_ref()],
            ctx.program_id,
        );
        require_keys_eq!(ra.key(), expected_pda, LotteryError::InvalidConfig);
        require_keys_eq!(ra.owner, subscription.referrer, LotteryError::InvalidConfig);
    } else {
        require!(
            ctx.accounts.referrer_account.is_none(),
            LotteryError::InvalidConfig
        );
    }

    require!(
        picks.len() == subscription.daily_ticket_count as usize,
        LotteryError::InvalidBatchSize
    );
    require!(
        picks.len() > 0 && picks.len() <= MAX_TICKETS_PER_BATCH,
        LotteryError::InvalidBatchSize
    );

    let normal_max = round.normal_ball_max;
    let bonus_max = round.bonusball_max;
    for pick in picks.iter() {
        validate_pick(&pick.normals, pick.bonusball, normal_max, bonus_max)?;
    }

    let count = picks.len() as u64;
    let ticket_price = round.ticket_price;
    let total_paid = ticket_price
        .checked_mul(count)
        .ok_or(error!(LotteryError::MathOverflow))?;
    require!(
        subscription.escrow_balance >= total_paid,
        LotteryError::SubscriptionInactive
    );

    let referral_fee_per = if subscription.has_referrer {
        bps_amount(ticket_price, ctx.accounts.config.referral_fee_bps)?
    } else {
        0
    };
    let referral_fee_total = referral_fee_per
        .checked_mul(count)
        .ok_or(error!(LotteryError::MathOverflow))?;
    let lp_edge_per = bps_amount(ticket_price, ctx.accounts.config.lp_edge_bps)?;
    let lp_edge_total = lp_edge_per
        .checked_mul(count)
        .ok_or(error!(LotteryError::MathOverflow))?;
    let ticket_prize_contribution = total_paid
        .checked_sub(referral_fee_total)
        .and_then(|n| n.checked_sub(lp_edge_total))
        .ok_or(error!(LotteryError::MathOverflow))?;

    let buyer_entry = &mut ctx.accounts.buyer_entry;
    if buyer_entry.round_id == 0 && buyer_entry.ticket_count == 0 {
        buyer_entry.round_id = round.round_id;
        buyer_entry.buyer = subscription.owner;
        buyer_entry.bump = ctx.bumps.buyer_entry;
    } else {
        require_eq!(
            buyer_entry.round_id,
            round.round_id,
            LotteryError::RoundIdMismatch
        );
    }
    let first_index = buyer_entry.ticket_count;

    require_eq!(
        ctx.remaining_accounts.len(),
        picks.len(),
        LotteryError::InvalidBatchSize
    );

    let rent = Rent::get()?;
    let space = 8 + Ticket::LEN;
    let lamports = rent.minimum_balance(space);
    let round_id_bytes = round.round_id.to_le_bytes();
    let owner_key = subscription.owner;
    let program_id = ctx.program_id;

    for (i, ticket_account) in ctx.remaining_accounts.iter().enumerate() {
        let ticket_index = first_index
            .checked_add(i as u64)
            .ok_or(error!(LotteryError::MathOverflow))?;
        let idx_bytes = ticket_index.to_le_bytes();
        let (expected_pda, bump) = Pubkey::find_program_address(
            &[TICKET_SEED, &round_id_bytes, owner_key.as_ref(), &idx_bytes],
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
            owner_key.as_ref(),
            &idx_bytes,
            &[bump],
        ];
        let signers = &[signer_seeds];
        system_program::create_account(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::CreateAccount {
                    from: ctx.accounts.keeper.to_account_info(),
                    to: ticket_account.clone(),
                },
                signers,
            ),
            lamports,
            space as u64,
            program_id,
        )?;

        let pick = picks[i];
        let ticket = Ticket {
            round_id: round.round_id,
            ticket_index,
            owner: owner_key,
            buyer: owner_key,
            referrer: subscription.referrer,
            has_referrer: subscription.has_referrer,
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
        .checked_add(count)
        .ok_or(error!(LotteryError::MathOverflow))?;

    let owner_key_for_seeds = subscription.owner;
    let signer_seeds: &[&[u8]] = &[
        SUBSCRIPTION_SEED,
        owner_key_for_seeds.as_ref(),
        &[subscription.bump],
    ];
    let signers = &[signer_seeds];
    if lp_edge_total > 0 {
        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.sub_escrow.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.lp_principal.to_account_info(),
                    authority: subscription.to_account_info(),
                },
                signers,
            ),
            lp_edge_total,
            ctx.accounts.usdc_mint.decimals,
        )?;
        ctx.accounts.lp_vault.total_assets = ctx
            .accounts
            .lp_vault
            .total_assets
            .checked_add(lp_edge_total)
            .ok_or(error!(LotteryError::MathOverflow))?;
    }

    let prize_vault_amount = total_paid
        .checked_sub(lp_edge_total)
        .ok_or(error!(LotteryError::MathOverflow))?;
    if prize_vault_amount > 0 {
        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.sub_escrow.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.prize_vault.to_account_info(),
                    authority: subscription.to_account_info(),
                },
                signers,
            ),
            prize_vault_amount,
            ctx.accounts.usdc_mint.decimals,
        )?;
    }

    if let Some(referrer_account) = ctx.accounts.referrer_account.as_mut() {
        referrer_account.accrued = referrer_account
            .accrued
            .checked_add(referral_fee_total)
            .ok_or(error!(LotteryError::MathOverflow))?;
        referrer_account.lifetime_earned = referrer_account
            .lifetime_earned
            .checked_add(referral_fee_total)
            .ok_or(error!(LotteryError::MathOverflow))?;
        round.referral_fees_accrued = round
            .referral_fees_accrued
            .checked_add(referral_fee_total)
            .ok_or(error!(LotteryError::MathOverflow))?;
    }

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
        .checked_add(count)
        .ok_or(error!(LotteryError::MathOverflow))?;

    subscription.escrow_balance = subscription
        .escrow_balance
        .checked_sub(total_paid)
        .ok_or(error!(LotteryError::MathOverflow))?;
    subscription.remaining_days = subscription.remaining_days.saturating_sub(1);
    subscription.last_processed_round = round.round_id;
    if subscription.remaining_days == 0 || subscription.escrow_balance < ticket_price {
        subscription.active = false;
    }

    emit!(SubscriptionProcessed {
        owner: subscription.owner,
        round_id: round.round_id,
        tickets_minted: count as u32,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct CancelSubscription<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    #[account(
        mut,
        seeds = [SUBSCRIPTION_SEED, owner.key().as_ref()],
        bump = subscription.bump,
        has_one = owner @ LotteryError::Unauthorized,
    )]
    pub subscription: Box<Account<'info, Subscription>>,

    #[account(address = config.usdc_mint @ LotteryError::InvalidTokenMint)]
    pub usdc_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        seeds = [SUB_ESCROW_SEED, owner.key().as_ref(), usdc_mint.key().as_ref()],
        bump = subscription.escrow_bump,
        token::mint = usdc_mint,
        token::authority = subscription,
    )]
    pub sub_escrow: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = owner,
    )]
    pub owner_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn cancel_subscription(ctx: Context<CancelSubscription>) -> Result<()> {
    let subscription = &mut ctx.accounts.subscription;
    let refund = subscription.escrow_balance;

    if refund > 0 {
        let owner_key = subscription.owner;
        let signer_seeds: &[&[u8]] = &[SUBSCRIPTION_SEED, owner_key.as_ref(), &[subscription.bump]];
        let signers = &[signer_seeds];
        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.sub_escrow.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.owner_token_account.to_account_info(),
                    authority: subscription.to_account_info(),
                },
                signers,
            ),
            refund,
            ctx.accounts.usdc_mint.decimals,
        )?;
    }

    subscription.escrow_balance = 0;
    subscription.active = false;
    subscription.remaining_days = 0;

    emit!(SubscriptionCanceled {
        owner: subscription.owner,
        refunded_amount: refund,
    });
    Ok(())
}
