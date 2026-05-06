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

    /// Fixed payout (USDC base units) per winning ticket for each tier.
    /// Populated by `finalize_payouts` (NOT `reveal_draw`) once winner counts are known:
    ///   payout[t] = min[t] + (premium * weight[t]) / max(combos[t], winner_count[t])
    /// Zero for non-winning tiers and tiers with no registered winners.
    pub payout_per_winner: [u64; TIER_COUNT],

    /// Snapshot of `Config.tier_is_winning` taken at start_round.
    pub tier_is_winning: [bool; TIER_COUNT],

    /// True when finalize_payouts applied guaranteed minimums; false when minimums were
    /// skipped because they would have consumed the premium floor.
    pub used_minimum_payouts: bool,

    pub tier_paid_counts: [u32; TIER_COUNT],
    pub tier_paid_amounts: [u64; TIER_COUNT],

    /// Number of registered winners per tier. Incremented by `register_winner` during
    /// the registration window. Used by `finalize_payouts` to size the per-winner premium.
    pub tier_winner_counts: [u32; TIER_COUNT],

    /// Unix timestamp after which `register_winner` is rejected and `finalize_payouts`
    /// becomes callable. Set in `reveal_draw` to `settled_at + registration_window_secs`.
    pub registration_close_time: i64,

    /// True once `finalize_payouts` has computed `payout_per_winner` for this round.
    /// Claims are only permitted after this flag is set.
    pub finalized: bool,

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
        + 8 * TIER_COUNT                        // payout_per_winner
        + 1 * TIER_COUNT                        // tier_is_winning
        + 1                                     // used_minimum_payouts
        + 4 * TIER_COUNT                        // tier_paid_counts
        + 8 * TIER_COUNT                        // tier_paid_amounts
        + 4 * TIER_COUNT                        // tier_winner_counts
        + 8                                     // registration_close_time
        + 1                                     // finalized
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
