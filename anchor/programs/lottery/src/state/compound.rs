use anchor_lang::prelude::*;

#[account]
pub struct CompoundState {
    pub owner: Pubkey,
    /// Sub-ticket-price USDC remainder carried over to the next compound.
    pub pending_usdc: u64,
    /// Total USDC ever compounded (sum of claimed winnings re-invested).
    pub lifetime_compounded: u64,
    /// Total tickets ever minted via auto-compound.
    pub lifetime_tickets: u64,
    pub bump: u8,
}

impl CompoundState {
    pub const LEN: usize = 32 + 8 + 8 + 8 + 1 + 16;
}
