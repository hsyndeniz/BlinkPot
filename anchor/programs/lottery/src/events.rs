use anchor_lang::prelude::*;

#[event]
pub struct ConfigInitialized {
    pub admin: Pubkey,
    pub usdc_mint: Pubkey,
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
pub struct RoundOpened {
    pub round_id: u64,
    pub ticket_price: u64,
    pub draw_time: i64,
    pub bonusball_max: u8,
    pub seed_prize_pool: u64,
}

#[event]
pub struct TicketsPurchased {
    pub round_id: u64,
    pub buyer: Pubkey,
    pub count: u32,
    pub first_ticket_index: u64,
    pub total_paid: u64,
    pub referrer: Option<Pubkey>,
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
    pub register_deadline: i64,
}

#[event]
pub struct WinnerRegistered {
    pub round_id: u64,
    pub ticket_index: u64,
    pub owner: Pubkey,
    pub tier: u8,
}

#[event]
pub struct TierPoolsTallied {
    pub round_id: u64,
    pub tier_winner_counts: [u32; 12],
    pub tier_pool_amounts: [u64; 12],
    pub rolled_to_lp: u64,
}

#[event]
pub struct WinningsClaimed {
    pub round_id: u64,
    pub ticket_index: u64,
    pub owner: Pubkey,
    pub tier: u8,
    pub amount: u64,
    pub referral_amount: u64,
}

#[event]
pub struct LpDeposited {
    pub owner: Pubkey,
    pub amount: u64,
    pub shares_minted: u64,
}

#[event]
pub struct LpWithdrawalInitiated {
    pub owner: Pubkey,
    pub shares: u64,
    pub round_id: u64,
}

#[event]
pub struct LpWithdrawalFinalized {
    pub owner: Pubkey,
    pub shares: u64,
    pub amount: u64,
}

#[event]
pub struct ReferralFeesClaimed {
    pub referrer: Pubkey,
    pub amount: u64,
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
    pub shares: u64,
    pub amount: u64,
}

#[event]
pub struct RoundArchived {
    pub round_id: u64,
}
