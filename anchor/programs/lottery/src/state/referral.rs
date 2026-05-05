use anchor_lang::prelude::*;

#[account]
pub struct Referral {
    pub owner: Pubkey,
    pub accrued: u64,
    pub lifetime_earned: u64,
    pub bump: u8,
}

impl Referral {
    pub const LEN: usize = 32 + 8 + 8 + 1 + 16;
}
