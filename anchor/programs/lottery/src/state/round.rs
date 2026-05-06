use anchor_lang::prelude::*;

use crate::constants::{NORMAL_BALL_COUNT, TIER_COUNT};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum RoundState {
    Open = 0,
    Drawing = 1,
    Settled = 2,
    Claimable = 3,
    Archived = 4,
    Emergency = 5,
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

    pub tier_winner_counts: [u32; TIER_COUNT],
    pub tier_pool_amounts: [u64; TIER_COUNT],
    pub tier_paid_counts: [u32; TIER_COUNT],
    pub tier_paid_amounts: [u64; TIER_COUNT],

    pub tally_done: bool,
    pub used_minimum_payouts: bool,
    pub min_payouts_total: u64,
    pub premium_payouts_total: u64,
    pub rolled_to_lp: u64,
    pub rolled_to_next_round: u64,

    /// Prize pool seeded from the previous round's rollover (set at start_round time).
    pub seed_prize_pool: u64,

    pub ticket_prize_pool: u64,
    pub lp_guarantee_reserved: u64,
    pub lp_loss_reserved: u64,
    pub player_funded_prizes: u64,

    /// Snapshot of tier weights and minimums at round start. Mid-round config changes
    /// don't affect rounds already in flight.
    pub tier_premium_weight_bps: [u16; TIER_COUNT],
    pub tier_min_payout_per_winner: [u64; TIER_COUNT],
    pub premium_min_allocation_bps: u16,
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
        + 4 * TIER_COUNT                        // tier_winner_counts
        + 8 * TIER_COUNT                        // tier_pool_amounts
        + 4 * TIER_COUNT                        // tier_paid_counts
        + 8 * TIER_COUNT                        // tier_paid_amounts
        + 1 + 1 + 8 + 8 + 8 + 8                 // tally fields
        + 8 + 8 + 8 + 8 + 8                     // seed/ticket/guarantee/loss/player-funded
        + 2 * TIER_COUNT                        // tier_premium_weight_bps snapshot
        + 8 * TIER_COUNT                        // tier_min_payout_per_winner snapshot
        + 2                                     // premium_min_allocation_bps snapshot
        + 64;                                   // padding

    pub fn is_open(&self) -> bool {
        matches!(self.state, RoundState::Open)
    }

    pub fn is_drawing(&self) -> bool {
        matches!(self.state, RoundState::Drawing)
    }

    pub fn is_settled(&self) -> bool {
        matches!(self.state, RoundState::Settled)
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
