use anchor_lang::prelude::*;

use crate::constants::TIER_COUNT;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum UntakenTierDestination {
    NextRound,
    LpPool,
}

impl Default for UntakenTierDestination {
    fn default() -> Self {
        UntakenTierDestination::NextRound
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct ConfigParams {
    pub default_ticket_price: u64,
    pub default_round_duration_secs: i64,
    pub guaranteed_prize_pool: u64,
    pub max_guarantee_per_round_bps: u16,
    pub draw_timeout_slots: u64,
    pub normal_ball_max: u8,
    pub bonusball_max: u8,

    /// LP edge (e.g. 2_000 = 20%).
    pub lp_edge_bps: u16,
    /// First-order referral fee on ticket purchase (e.g. 800 = 8%).
    pub referral_fee_first_bps: u16,
    /// Second-order referral fee on ticket purchase (e.g. 200 = 2%).
    pub referral_fee_second_bps: u16,
    /// First-order win share (paid at claim).
    pub referral_win_share_first_bps: u16,
    /// Second-order win share (paid at claim).
    pub referral_win_share_second_bps: u16,

    pub lp_pool_cap: u64,

    /// Premium pool weights per tier in BPS (must sum to exactly 10_000).
    /// Non-winning tiers must have weight 0.
    pub tier_premium_weight_bps: [u16; TIER_COUNT],
    /// Guaranteed minimum payout per winner per tier (USDC base units).
    /// 0 = no minimum for that tier.
    pub tier_min_payout_per_winner: [u64; TIER_COUNT],
    /// Whether a tier is claimable. Megapot defaults: tier 0 (no match) and tier 2
    /// (1 normal, no bonus) are non-winning; everything else is winning even if its
    /// premium weight is 0 (e.g. "bonusball only" earns just the guaranteed minimum).
    pub tier_is_winning: [bool; TIER_COUNT],
    /// Floor (in BPS) of prize_pool that must remain in the premium pool after guaranteed
    /// minimums are paid. If guaranteed minimums would consume more than (1 - floor),
    /// the round skips guaranteed minimums and pays purely by premium weights.
    pub premium_min_allocation_bps: u16,

    pub untaken_tier_destination: UntakenTierDestination,

    /// Dynamic bonusball: when enabled, bonusball_max scales with prize pool size.
    pub dynamic_bonusball_enabled: bool,
    pub bonusball_base: u8,
    /// USDC base-unit step that adds 1 to bonusball_max.
    pub bonusball_pool_step_usdc: u64,
}

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub usdc_mint: Pubkey,
    pub prize_vault_authority_bump: u8,
    pub lp_authority_bump: u8,
    pub bump: u8,
    pub paused: bool,
    pub emergency_mode: bool,

    pub default_ticket_price: u64,
    pub default_round_duration_secs: i64,
    pub guaranteed_prize_pool: u64,
    pub max_guarantee_per_round_bps: u16,
    pub draw_timeout_slots: u64,
    pub normal_ball_max: u8,
    pub bonusball_max: u8,

    pub lp_edge_bps: u16,
    pub referral_fee_first_bps: u16,
    pub referral_fee_second_bps: u16,
    pub referral_win_share_first_bps: u16,
    pub referral_win_share_second_bps: u16,

    pub lp_pool_cap: u64,

    pub tier_premium_weight_bps: [u16; TIER_COUNT],
    pub tier_min_payout_per_winner: [u64; TIER_COUNT],
    pub tier_is_winning: [bool; TIER_COUNT],
    pub premium_min_allocation_bps: u16,

    pub untaken_tier_destination: UntakenTierDestination,

    pub dynamic_bonusball_enabled: bool,
    pub bonusball_base: u8,
    pub bonusball_pool_step_usdc: u64,
}

impl Config {
    pub const LEN: usize = 32          // admin
        + 32                            // usdc_mint
        + 1 + 1 + 1                     // bumps
        + 1 + 1                         // paused, emergency_mode
        + 8 + 8 + 8 + 2 + 8             // pricing/timing/guarantee/cap/draw_timeout
        + 1 + 1                         // normal_ball_max, bonusball_max
        + 2 * 5                         // 5 fee bps fields
        + 8                             // lp_pool_cap
        + 2 * TIER_COUNT                // tier_premium_weight_bps
        + 8 * TIER_COUNT                // tier_min_payout_per_winner
        + 1 * TIER_COUNT                // tier_is_winning
        + 2                             // premium_min_allocation_bps
        + 1 + 32                        // untaken_tier_destination + enum padding
        + 1 + 1 + 8                     // dynamic_bonusball + base + step
        + 64;                           // forward-compatible padding

    pub fn apply_params(&mut self, params: &ConfigParams) {
        self.default_ticket_price = params.default_ticket_price;
        self.default_round_duration_secs = params.default_round_duration_secs;
        self.guaranteed_prize_pool = params.guaranteed_prize_pool;
        self.max_guarantee_per_round_bps = params.max_guarantee_per_round_bps;
        self.draw_timeout_slots = params.draw_timeout_slots;
        self.normal_ball_max = params.normal_ball_max;
        self.bonusball_max = params.bonusball_max;
        self.lp_edge_bps = params.lp_edge_bps;
        self.referral_fee_first_bps = params.referral_fee_first_bps;
        self.referral_fee_second_bps = params.referral_fee_second_bps;
        self.referral_win_share_first_bps = params.referral_win_share_first_bps;
        self.referral_win_share_second_bps = params.referral_win_share_second_bps;
        self.lp_pool_cap = params.lp_pool_cap;
        self.tier_premium_weight_bps = params.tier_premium_weight_bps;
        self.tier_min_payout_per_winner = params.tier_min_payout_per_winner;
        self.tier_is_winning = params.tier_is_winning;
        self.premium_min_allocation_bps = params.premium_min_allocation_bps;
        self.untaken_tier_destination = params.untaken_tier_destination;
        self.dynamic_bonusball_enabled = params.dynamic_bonusball_enabled;
        self.bonusball_base = params.bonusball_base;
        self.bonusball_pool_step_usdc = params.bonusball_pool_step_usdc;
    }

    /// Total referral fee BPS (first + second).
    pub fn referral_fee_total_bps(&self) -> u16 {
        self.referral_fee_first_bps
            .saturating_add(self.referral_fee_second_bps)
    }

    /// Total referral win share BPS (first + second).
    pub fn referral_win_share_total_bps(&self) -> u16 {
        self.referral_win_share_first_bps
            .saturating_add(self.referral_win_share_second_bps)
    }
}

#[account]
pub struct RoundCounter {
    pub current_round_id: u64,
    pub last_settled_round_id: u64,
    pub bump: u8,
}

impl RoundCounter {
    pub const LEN: usize = 8 + 8 + 1 + 16;
}
