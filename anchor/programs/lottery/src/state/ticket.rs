use anchor_lang::prelude::*;

use crate::constants::NORMAL_BALL_COUNT;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct TicketPick {
    pub normals: [u8; NORMAL_BALL_COUNT],
    pub bonusball: u8,
}

#[account]
pub struct Ticket {
    pub round_id: u64,
    pub ticket_index: u64,
    pub owner: Pubkey,
    pub buyer: Pubkey,
    pub referrer: Pubkey,
    pub parent_referrer: Pubkey,
    pub has_referrer: bool,
    pub has_parent_referrer: bool,
    pub purchased_at: i64,
    pub price_paid: u64,
    pub normals: [u8; NORMAL_BALL_COUNT],
    pub bonusball: u8,
    pub claimed: bool,
    pub bump: u8,
}

impl Ticket {
    pub const LEN: usize = 8                // round_id
        + 8                                  // ticket_index
        + 32 + 32                            // owner, buyer
        + 32 + 32                            // referrer, parent_referrer
        + 1 + 1                              // has_referrer, has_parent_referrer
        + 8                                  // purchased_at
        + 8                                  // price_paid
        + NORMAL_BALL_COUNT + 1              // normals, bonusball
        + 1 + 1;                             // claimed, bump
}
