use anchor_lang::prelude::*;

use crate::constants::{NORMAL_BALL_COUNT, TIER_COUNT};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum RoundState {
    Open = 0,
    Drawing = 1,
    Claimable = 2,
    Archived = 3,
    Emergency = 4,
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
    pub emergency_at: i64,

    pub randomness_account: Pubkey,
    pub winning_normals: [u8; NORMAL_BALL_COUNT],
    pub winning_bonusball: u8,

    pub ticket_count: u64,
    pub claimed_count: u64,

    pub prize_pool: u64,
    pub lp_edge_accrued: u64,
    pub referral_fees_accrued: u64,

    /// Prize pool seeded from the previous round's rollover (set at start_round time).
    pub seed_prize_pool: u64,
    pub lp_guarantee_reserved: u64,

    /// Per-(winning) combo payout for each tier (payment-mint base units), populated by
    /// `reveal_draw`. The value covers ONE combo's full share — actual per-ticket payout
    /// at claim time is `per_combo_payout[tier] / pick_counter.count`, where the counter
    /// tracks how many tickets share the winning pick. This is what prevents duplicate
    /// winning tickets from over-drawing the prize pool.
    pub per_combo_payout: [u64; TIER_COUNT],

    /// Snapshot of `Config.tier_is_winning` taken at start_round.
    pub tier_is_winning: [bool; TIER_COUNT],

    /// True when reveal_draw applied guaranteed minimums; false when minimums were
    /// skipped because they would have consumed the premium floor.
    pub used_minimum_payouts: bool,

    pub tier_paid_counts: [u32; TIER_COUNT],
    pub tier_paid_amounts: [u64; TIER_COUNT],

    /// Filled in by archive_round.
    pub rolled_to_lp: u64,
    pub rolled_to_next_round: u64,
}

impl Round {
    pub const LEN: usize = 8                   // round_id
        + 1 + 1                                 // state, bump
        + 8 + 1 + 1                             // ticket_price, bonusball_max, normal_ball_max
        + 8 * 5                                 // opened_at, draw_time, commit_slot, settled_at, emergency_at
        + 32                                    // randomness_account
        + NORMAL_BALL_COUNT + 1                 // winning_normals, winning_bonusball
        + 8 + 8                                 // ticket_count, claimed_count
        + 8 + 8 + 8                             // prize_pool, lp_edge_accrued, referral_fees_accrued
        + 8 + 8                                 // seed_prize_pool, lp_guarantee_reserved
        + 8 * TIER_COUNT                        // per_combo_payout
        + 1 * TIER_COUNT                        // tier_is_winning
        + 1                                     // used_minimum_payouts
        + 4 * TIER_COUNT                        // tier_paid_counts
        + 8 * TIER_COUNT                        // tier_paid_amounts
        + 8 + 8                                 // rolled_to_lp, rolled_to_next_round
        + 64;                                   // padding

    pub fn is_open(&self) -> bool {
        matches!(self.state, RoundState::Open)
    }

    pub fn is_drawing(&self) -> bool {
        matches!(self.state, RoundState::Drawing)
    }

    pub fn is_claimable(&self) -> bool {
        matches!(self.state, RoundState::Claimable)
    }

    pub fn is_archived(&self) -> bool {
        matches!(self.state, RoundState::Archived)
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
