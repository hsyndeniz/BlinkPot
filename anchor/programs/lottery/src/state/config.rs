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
    pub register_window_secs: i64,
    pub guaranteed_prize_pool: u64,
    pub draw_timeout_slots: u64,
    pub normal_ball_max: u8,
    pub bonusball_max: u8,
    pub lp_edge_bps: u16,
    pub referral_fee_bps: u16,
    pub referral_win_share_bps: u16,
    pub lp_pool_cap: u64,
    pub tier_payout_bps: [u16; TIER_COUNT],
    pub untaken_tier_destination: UntakenTierDestination,
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
    pub register_window_secs: i64,
    pub guaranteed_prize_pool: u64,
    pub draw_timeout_slots: u64,
    pub normal_ball_max: u8,
    pub bonusball_max: u8,
    pub lp_edge_bps: u16,
    pub referral_fee_bps: u16,
    pub referral_win_share_bps: u16,
    pub lp_pool_cap: u64,
    pub tier_payout_bps: [u16; TIER_COUNT],
    pub untaken_tier_destination: UntakenTierDestination,
}

impl Config {
    pub const LEN: usize = 32
        + 32
        + 1
        + 1
        + 1
        + 1
        + 1
        + 8
        + 8
        + 8
        + 8
        + 8
        + 1
        + 1
        + 2
        + 2
        + 2
        + 8
        + 2 * TIER_COUNT
        + 1
        + 32;

    pub fn apply_params(&mut self, params: &ConfigParams) {
        self.default_ticket_price = params.default_ticket_price;
        self.default_round_duration_secs = params.default_round_duration_secs;
        self.register_window_secs = params.register_window_secs;
        self.guaranteed_prize_pool = params.guaranteed_prize_pool;
        self.draw_timeout_slots = params.draw_timeout_slots;
        self.normal_ball_max = params.normal_ball_max;
        self.bonusball_max = params.bonusball_max;
        self.lp_edge_bps = params.lp_edge_bps;
        self.referral_fee_bps = params.referral_fee_bps;
        self.referral_win_share_bps = params.referral_win_share_bps;
        self.lp_pool_cap = params.lp_pool_cap;
        self.tier_payout_bps = params.tier_payout_bps;
        self.untaken_tier_destination = params.untaken_tier_destination;
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
