use anchor_lang::prelude::Pubkey;

pub const CONFIG_SEED: &[u8] = b"config";
pub const ROUND_COUNTER_SEED: &[u8] = b"round_counter";
pub const ROUND_SEED: &[u8] = b"round";
pub const TICKET_SEED: &[u8] = b"ticket";
pub const LP_VAULT_SEED: &[u8] = b"lp_vault";
pub const LP_POSITION_SEED: &[u8] = b"lp";
pub const LP_AUTHORITY_SEED: &[u8] = b"lp_authority";
pub const PRIZE_VAULT_AUTHORITY_SEED: &[u8] = b"prize_vault_authority";
pub const REFERRAL_SEED: &[u8] = b"referral";
pub const SUBSCRIPTION_SEED: &[u8] = b"sub";
pub const SUB_ESCROW_SEED: &[u8] = b"sub_escrow";
pub const BUYER_ENTRY_SEED: &[u8] = b"buyer_entry";
pub const COMPOUND_STATE_SEED: &[u8] = b"compound";
pub const PRIZE_VAULT_TOKEN_SEED: &[u8] = b"prize_vault_token";
pub const LP_PRINCIPAL_TOKEN_SEED: &[u8] = b"lp_principal_token";

pub const BPS_DENOM: u64 = 10_000;
pub const TIER_COUNT: usize = 12;

pub const NORMAL_BALL_COUNT: usize = 5;
pub const NORMAL_BALL_MIN: u8 = 1;
pub const DEFAULT_NORMAL_BALL_MAX: u8 = 30;
pub const DEFAULT_BONUSBALL_MAX: u8 = 15;
pub const MIN_BONUSBALL_MAX: u8 = 5;
pub const MAX_BONUSBALL_MAX: u8 = 64;

pub const MAX_TICKETS_PER_BATCH: usize = 20;
pub const MAX_COMPOUND_TICKETS_PER_CALL: u8 = 5;
pub const MIN_ROUND_DURATION_SECS: i64 = 60;
pub const MAX_ROUND_DURATION_SECS: i64 = 7 * 24 * 60 * 60;
pub const EMERGENCY_TIMEOUT_SECS: i64 = 60 * 60;

pub const SHARE_SCALE: u128 = 1_000_000_000_000;
pub const INITIAL_SHARES_PER_USDC: u128 = 1_000_000;

pub const MAX_DAYS_PER_SUBSCRIPTION: u16 = 365;
pub const MAX_DAILY_TICKETS_PER_SUB: u8 = 20;

/// Minimum BPS that must be reserved for the prize pool (after LP edge + referral fees).
/// Enforces the protocol's "70% to players" philosophy with a 50% absolute floor.
pub const MIN_PRIZE_POOL_BPS: u16 = 5_000;

/// Maximum BPS of LP NAV that may be reserved as a per-round guaranteed prize pool.
pub const MAX_GUARANTEE_PER_ROUND_BPS_CAP: u16 = 5_000;

pub fn switchboard_program_id() -> Pubkey {
    #[cfg(feature = "devnet")]
    {
        return switchboard_on_demand::ON_DEMAND_DEVNET_PID;
    }
    #[cfg(not(feature = "devnet"))]
    switchboard_on_demand::ON_DEMAND_MAINNET_PID
}
