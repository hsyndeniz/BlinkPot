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
    pub has_referrer: bool,
    pub purchased_at: i64,
    pub price_paid: u64,
    pub normals: [u8; NORMAL_BALL_COUNT],
    pub bonusball: u8,
    pub registered: bool,
    pub claimed: bool,
    pub tier: u8,
    pub bump: u8,
}

impl Ticket {
    pub const LEN: usize = 8 + 8 + 32 + 32 + 32 + 1 + 8 + 8
        + NORMAL_BALL_COUNT + 1
        + 1 + 1 + 1 + 1 + 16;
}
