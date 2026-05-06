use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod math;
pub mod state;

#[cfg(test)]
mod tests;

use instructions::*;
use state::config::ConfigParams;
use state::ticket::TicketPick;

declare_id!("5XEpujFy87sWxVMBj4DasfxZNHdkYftRPs6UN5X95L7r");

#[program]
pub mod lottery {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>, params: ConfigParams) -> Result<()> {
        instructions::admin::initialize_config(ctx, params)
    }

    pub fn update_config(ctx: Context<UpdateConfig>, params: ConfigParams) -> Result<()> {
        instructions::admin::update_config(ctx, params)
    }

    pub fn set_paused(ctx: Context<AdminToggle>, paused: bool) -> Result<()> {
        instructions::admin::set_paused(ctx, paused)
    }

    pub fn set_emergency_mode(ctx: Context<AdminToggle>, enabled: bool) -> Result<()> {
        instructions::admin::set_emergency_mode(ctx, enabled)
    }

    pub fn enter_round_emergency(ctx: Context<EnterRoundEmergency>) -> Result<()> {
        instructions::emergency::enter_round_emergency(ctx)
    }

    pub fn start_round(
        ctx: Context<StartRound>,
        ticket_price: u64,
        duration_seconds: i64,
        bonusball_max: u8,
        guaranteed_prize_pool_override: u64,
    ) -> Result<()> {
        instructions::round::start_round(
            ctx,
            ticket_price,
            duration_seconds,
            bonusball_max,
            guaranteed_prize_pool_override,
        )
    }

    pub fn buy_tickets<'info>(
        ctx: Context<'_, '_, '_, 'info, BuyTickets<'info>>,
        picks: Vec<TicketPick>,
        referrer: Option<Pubkey>,
    ) -> Result<()> {
        instructions::ticket::buy_tickets(ctx, picks, referrer)
    }

    pub fn commit_draw(ctx: Context<CommitDraw>) -> Result<()> {
        instructions::draw::commit_draw(ctx)
    }

    pub fn reveal_draw(ctx: Context<RevealDraw>) -> Result<()> {
        instructions::draw::reveal_draw(ctx)
    }

    pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
        instructions::claim::claim_winnings(ctx)
    }

    pub fn lp_deposit(ctx: Context<LpDeposit>, amount: u64) -> Result<()> {
        instructions::lp::lp_deposit(ctx, amount)
    }

    pub fn lp_initiate_withdraw(ctx: Context<LpInitiateWithdraw>, shares: u64) -> Result<()> {
        instructions::lp::lp_initiate_withdraw(ctx, shares)
    }

    pub fn lp_finalize_withdraw(ctx: Context<LpFinalizeWithdraw>) -> Result<()> {
        instructions::lp::lp_finalize_withdraw(ctx)
    }

    pub fn claim_referral_fees(ctx: Context<ClaimReferralFees>) -> Result<()> {
        instructions::referral::claim_referral_fees(ctx)
    }

    pub fn initialize_referral(
        ctx: Context<InitializeReferral>,
        parent_referrer: Pubkey,
    ) -> Result<()> {
        instructions::referral::initialize_referral(ctx, parent_referrer)
    }

    pub fn subscribe_daily(
        ctx: Context<SubscribeDaily>,
        daily_ticket_count: u8,
        days: u16,
        referrer: Option<Pubkey>,
    ) -> Result<()> {
        instructions::subscription::subscribe_daily(ctx, daily_ticket_count, days, referrer)
    }

    pub fn process_subscription<'info>(
        ctx: Context<'_, '_, '_, 'info, ProcessSubscription<'info>>,
        picks: Vec<TicketPick>,
    ) -> Result<()> {
        instructions::subscription::process_subscription(ctx, picks)
    }

    pub fn cancel_subscription(ctx: Context<CancelSubscription>) -> Result<()> {
        instructions::subscription::cancel_subscription(ctx)
    }

    pub fn emergency_refund_ticket(ctx: Context<EmergencyRefundTicket>) -> Result<()> {
        instructions::emergency::emergency_refund_ticket(ctx)
    }

    pub fn emergency_lp_withdraw(ctx: Context<EmergencyLpWithdraw>) -> Result<()> {
        instructions::emergency::emergency_lp_withdraw(ctx)
    }

    pub fn archive_round(ctx: Context<ArchiveRound>) -> Result<()> {
        instructions::round::archive_round(ctx)
    }
}
