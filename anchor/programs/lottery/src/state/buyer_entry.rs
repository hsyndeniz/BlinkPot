use anchor_lang::prelude::*;

#[account]
pub struct BuyerEntry {
    /// Set to `true` the first time this PDA is written. Subsequent calls must enter the
    /// "already initialized" branch. This is an explicit defense against `init_if_needed`
    /// reinitialization rather than relying on the natural-zero check of other fields.
    pub initialized: bool,
    pub round_id: u64,
    pub buyer: Pubkey,
    pub ticket_count: u64,
    pub bump: u8,
}

impl BuyerEntry {
    pub const LEN: usize = 1 + 8 + 32 + 8 + 1 + 16;
}
