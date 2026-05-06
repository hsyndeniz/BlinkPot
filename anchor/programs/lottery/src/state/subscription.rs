use anchor_lang::prelude::*;

#[account]
pub struct Subscription {
    /// Set to `true` the first time this PDA is written. Subsequent re-subscriptions
    /// (which reuse the same PDA via `init_if_needed`) take the "already initialized"
    /// branch and must satisfy the inactive + zero-escrow guards.
    pub initialized: bool,
    pub owner: Pubkey,
    pub daily_ticket_count: u8,
    pub agreed_price: u64,
    pub remaining_days: u16,
    pub last_processed_round: u64,
    pub expires_at: i64,
    pub referrer: Pubkey,
    pub has_referrer: bool,
    pub active: bool,
    pub escrow_balance: u64,
    pub bump: u8,
    pub escrow_bump: u8,
}

impl Subscription {
    pub const LEN: usize = 1 + 32 + 1 + 8 + 2 + 8 + 8 + 32 + 1 + 1 + 8 + 1 + 1 + 16;
}
