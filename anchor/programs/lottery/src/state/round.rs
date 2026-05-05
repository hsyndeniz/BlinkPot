use anchor_lang::prelude::*;

use crate::constants::{NORMAL_BALL_COUNT, TIER_COUNT};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum RoundState {
    Open = 0,
    Drawing = 1,
    Settled = 2,
    Registering = 3,
    Claimable = 4,
    Archived = 5,
    Emergency = 6,
}

#[account]
pub struct Round {
    pub round_id: u64,
    pub state: RoundState,
    pub bump: u8,

    pub ticket_price: u64,
    pub bonusball_max: u8,
    pub normal_ball_max: u8,

    pub opened_at: i64,
    pub draw_time: i64,
    pub commit_slot: u64,
    pub settled_at: i64,
    pub register_deadline: i64,
    pub emergency_at: i64,

    pub randomness_account: Pubkey,
    pub winning_normals: [u8; NORMAL_BALL_COUNT],
    pub winning_bonusball: u8,

    pub ticket_count: u64,
    pub registered_count: u64,
    pub claimed_count: u64,

    pub prize_pool: u64,
    pub lp_edge_accrued: u64,
    pub referral_fees_accrued: u64,

    pub tier_winner_counts: [u32; TIER_COUNT],
    pub tier_pool_amounts: [u64; TIER_COUNT],
    pub tier_paid_counts: [u32; TIER_COUNT],
    pub tier_paid_amounts: [u64; TIER_COUNT],

    pub tally_done: bool,
    pub rolled_to_lp: u64,
    pub rolled_to_next_round: u64,

    /// Prize pool seeded from the previous round's rollover (set at start_round time).
    /// Stored so the frontend can always display it separately from ticket revenue.
    pub seed_prize_pool: u64,
}

impl Round {
    pub const LEN: usize = 8
        + 1
        + 1
        + 8 + 1 + 1
        + 8 + 8 + 8 + 8 + 8 + 8
        + 32
        + NORMAL_BALL_COUNT
        + 1
        + 8 + 8 + 8
        + 8 + 8 + 8
        + 4 * TIER_COUNT
        + 8 * TIER_COUNT
        + 4 * TIER_COUNT
        + 8 * TIER_COUNT
        + 1 + 8 + 8
        + 8        // seed_prize_pool
        + 56;      // reserved padding (was 64; gave 8 bytes to seed_prize_pool)

    pub fn is_open(&self) -> bool {
        matches!(self.state, RoundState::Open)
    }

    pub fn is_drawing(&self) -> bool {
        matches!(self.state, RoundState::Drawing)
    }

    pub fn is_settled(&self) -> bool {
        matches!(self.state, RoundState::Settled | RoundState::Registering)
    }

    pub fn is_claimable(&self) -> bool {
        matches!(self.state, RoundState::Claimable)
    }

    pub fn is_emergency(&self) -> bool {
        matches!(self.state, RoundState::Emergency)
    }

    pub fn is_terminal(&self) -> bool {
        matches!(
            self.state,
            RoundState::Claimable | RoundState::Archived | RoundState::Emergency
        )
    }
}
