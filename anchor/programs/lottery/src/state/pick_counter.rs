use anchor_lang::prelude::*;

use crate::constants::NORMAL_BALL_COUNT;

/// Per-(round, pick) duplicate counter. Created on the first ticket purchase that uses
/// a particular `(normals, bonusball)` combination in a given round, then incremented on
/// every subsequent ticket that shares the same combo. At claim time the per-combo
/// payout is divided by `count` so all tickets sharing a winning combo split that
/// combo's allocation evenly. This is the on-chain mechanism that prevents duplicate
/// winners from over-drawing the prize pool — replacing the older
/// register_winner/finalize_payouts handshake with a write at buy-time.
#[account]
pub struct PickCounter {
    /// Explicit init flag — same defense pattern used by other PDAs in this program
    /// (BuyerEntry, LpPosition, Subscription) against `init_if_needed` reinit issues.
    pub initialized: bool,
    pub round_id: u64,
    pub normals: [u8; NORMAL_BALL_COUNT],
    pub bonusball: u8,
    /// Number of tickets in `round_id` that share this exact `(normals, bonusball)` combo.
    pub count: u32,
    pub bump: u8,
}

impl PickCounter {
    pub const LEN: usize = 1                   // initialized
        + 8                                     // round_id
        + NORMAL_BALL_COUNT                     // normals
        + 1                                     // bonusball
        + 4                                     // count
        + 1                                     // bump
        + 16;                                   // forward-compat padding
}
