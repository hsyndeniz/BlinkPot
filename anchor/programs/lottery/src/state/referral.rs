use anchor_lang::prelude::*;

#[account]
pub struct Referral {
    pub owner: Pubkey,
    /// Upstream referrer set when this Referral PDA is initialized. Pubkey::default() means
    /// the referrer has no upstream parent (top of the chain).
    pub parent_referrer: Pubkey,
    /// Has a non-default parent referrer.
    pub has_parent: bool,
    /// Currently claimable balance (sum of unclaimed first- and second-order earnings).
    pub accrued: u64,
    /// Lifetime first-order earnings (purchase fees + win share from direct referrals).
    pub lifetime_earned_first: u64,
    /// Lifetime second-order earnings (from referrer-of-referrers' activity).
    pub lifetime_earned_second: u64,
    pub bump: u8,
}

impl Referral {
    pub const LEN: usize = 32         // owner
        + 32                           // parent_referrer
        + 1                            // has_parent
        + 8                            // accrued
        + 8 + 8                        // lifetime_earned_first, _second
        + 1                            // bump
        + 16;                          // padding
}
