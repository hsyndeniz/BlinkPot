use anchor_lang::prelude::*;

#[event]
pub struct ConfigInitialized {
    pub admin: Pubkey,
    pub payment_mint: Pubkey,
}

#[event]
pub struct ConfigUpdated {
    pub admin: Pubkey,
}

#[event]
pub struct PausedToggled {
    pub paused: bool,
}

#[event]
pub struct EmergencyModeToggled {
    pub enabled: bool,
}

#[event]
pub struct RoundEmergencyEntered {
    pub round_id: u64,
    pub emergency_at: i64,
}

#[event]
pub struct RoundOpened {
    pub round_id: u64,
    pub ticket_price: u64,
    pub draw_time: i64,
    pub bonusball_max: u8,
    pub seed_prize_pool: u64,
    pub guaranteed_prize_pool: u64,
}

#[event]
pub struct TicketsPurchased {
    pub round_id: u64,
    pub buyer: Pubkey,
    pub count: u32,
    pub first_ticket_index: u64,
    pub total_paid: u64,
    pub referrer: Option<Pubkey>,
    pub parent_referrer: Option<Pubkey>,
}

#[event]
pub struct DrawCommitted {
    pub round_id: u64,
    pub randomness_account: Pubkey,
    pub commit_slot: u64,
}

#[event]
pub struct DrawSettled {
    pub round_id: u64,
    pub winning_normals: [u8; 5],
    pub winning_bonusball: u8,
    pub per_combo_payout: [u64; 12],
    pub used_minimum_payouts: bool,
}

#[event]
pub struct WinningsClaimed {
    pub round_id: u64,
    pub ticket_index: u64,
    pub owner: Pubkey,
    pub tier: u8,
    pub amount: u64,
    pub referral_first_amount: u64,
    pub referral_second_amount: u64,
}

#[event]
pub struct LpDeposited {
    pub owner: Pubkey,
    pub amount: u64,
    /// LP shares are stored on-chain as u128. The event uses u128 too so large LP
    /// pools (>~$18M of first-deposit at 6-dec mints, proportionally lower at higher
    /// decimals) don't silently saturate at u64::MAX in indexer feeds.
    pub shares_minted: u128,
}

#[event]
pub struct LpWithdrawalInitiated {
    pub owner: Pubkey,
    pub shares: u128,
    pub round_id: u64,
}

#[event]
pub struct LpWithdrawalFinalized {
    pub owner: Pubkey,
    pub shares: u128,
    pub amount: u64,
}

#[event]
pub struct LpVaultMarked {
    pub total_shares: u128,
    pub total_assets: u64,
    pub share_price_q: u128,
    pub lifetime_edge_earned: u64,
    pub lifetime_jackpot_loss: u64,
}

#[event]
pub struct ReferralFeesClaimed {
    pub referrer: Pubkey,
    pub amount: u64,
}

#[event]
pub struct ReferralInitialized {
    pub referrer: Pubkey,
    pub parent_referrer: Option<Pubkey>,
}

#[event]
pub struct SubscriptionCreated {
    pub owner: Pubkey,
    pub daily_ticket_count: u8,
    pub agreed_price: u64,
    pub expires_at: i64,
}

#[event]
pub struct SubscriptionProcessed {
    pub owner: Pubkey,
    pub round_id: u64,
    pub tickets_minted: u32,
}

#[event]
pub struct SubscriptionCanceled {
    pub owner: Pubkey,
    pub refunded_amount: u64,
}

#[event]
pub struct EmergencyTicketRefunded {
    pub round_id: u64,
    pub ticket_index: u64,
    pub owner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct EmergencyLpWithdrawn {
    pub owner: Pubkey,
    pub shares: u128,
    pub amount: u64,
}

#[event]
pub struct RoundArchived {
    pub round_id: u64,
    pub rolled_to_lp: u64,
    pub rolled_to_next_round: u64,
}
