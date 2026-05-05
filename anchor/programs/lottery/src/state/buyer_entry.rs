use anchor_lang::prelude::*;

#[account]
pub struct BuyerEntry {
    pub round_id: u64,
    pub buyer: Pubkey,
    pub ticket_count: u64,
    pub bump: u8,
}

impl BuyerEntry {
    pub const LEN: usize = 8 + 32 + 8 + 1 + 16;
}
