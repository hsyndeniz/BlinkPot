use anchor_lang::prelude::*;

#[account]
pub struct LpVault {
    pub bump: u8,
    pub authority_bump: u8,
    pub total_shares: u128,
    pub total_assets: u64,
    pub pending_withdraw_shares: u128,
}

impl LpVault {
    pub const LEN: usize = 1 + 1 + 16 + 8 + 16 + 16;
}

#[account]
pub struct LpPosition {
    pub owner: Pubkey,
    pub shares: u128,
    pub last_deposit_at: i64,
    pub pending_withdraw_shares: u128,
    pub pending_withdraw_round: u64,
    pub pending_withdraw_initiated_at: i64,
    pub bump: u8,
}

impl LpPosition {
    pub const LEN: usize = 32 + 16 + 8 + 16 + 8 + 8 + 1 + 16;

    pub fn has_pending_withdrawal(&self) -> bool {
        self.pending_withdraw_shares > 0
    }
}
