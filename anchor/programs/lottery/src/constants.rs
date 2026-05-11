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
pub const PRIZE_VAULT_TOKEN_SEED: &[u8] = b"prize_vault_token";
pub const LP_PRINCIPAL_TOKEN_SEED: &[u8] = b"lp_principal_token";
pub const PICK_COUNTER_SEED: &[u8] = b"pick_counter";

pub const BPS_DENOM: u64 = 10_000;
pub const TIER_COUNT: usize = 12;

/// Default premium-allocation tier weights. Sum = 10_000 bps.
/// Tier index = matches * 2 + (1 if has_bonus else 0).
///   tier 0  (0, no)  : non-winning
///   tier 1  (0, yes) : 0 bps  (winning, min only)
///   tier 2  (1, no)  : non-winning
///   tier 3  (1, yes) : 1200
///   tier 4  (2, no)  : 0 bps  (winning, min only)
///   tier 5  (2, yes) : 1200
///   tier 6  (3, no)  : 1200
///   tier 7  (3, yes) : 600
///   tier 8  (4, no)  : 600
///   tier 9  (4, yes) : 600
///   tier 10 (5, no)  : 600
///   tier 11 (5, yes) : 4000  (jackpot)
pub const DEFAULT_TIER_PREMIUM_WEIGHT_BPS: [u16; TIER_COUNT] =
    [0, 0, 0, 1_200, 0, 1_200, 1_200, 600, 600, 600, 600, 4_000];

/// Default winning-tier flags. `false` = ticket cannot be claimed.
pub const DEFAULT_TIER_IS_WINNING: [bool; TIER_COUNT] = [
    false, // 0 — no matches, no bonus
    true,  // 1 — bonusball only
    false, // 2 — 1 normal, no bonus
    true, true, true, true, true, true, true, true, true,
];

pub const NORMAL_BALL_COUNT: usize = 5;
pub const NORMAL_BALL_MIN: u8 = 1;
pub const DEFAULT_NORMAL_BALL_MAX: u8 = 30;
pub const DEFAULT_BONUSBALL_MAX: u8 = 15;
pub const MIN_BONUSBALL_MAX: u8 = 5;
pub const MAX_BONUSBALL_MAX: u8 = 64;

/// Tickets per `buy_tickets` / `process_subscription` batch.
///
/// Each ticket adds 2 writable PDAs (Ticket + PickCounter) to
/// `remaining_accounts`. With the 16 fixed accounts and a prepended
/// `create_associated_token_account` instruction in the buy tx, 7 keeps us
/// under Solana's 64-account / 1232-byte legacy tx limits with headroom.
/// Raising this requires Address Lookup Tables (to compress the 16 fixed
/// accounts) or a protocol change that drops per-ticket PDAs.
pub const MAX_TICKETS_PER_BATCH: usize = 7;
pub const MIN_ROUND_DURATION_SECS: i64 = 60;
pub const MAX_ROUND_DURATION_SECS: i64 = 7 * 24 * 60 * 60;
pub const EMERGENCY_TIMEOUT_SECS: i64 = 60 * 60;

pub const SHARE_SCALE: u128 = 1_000_000_000_000;
/// Share-precision multiplier for the very first deposit (when `total_shares == 0`).
/// Decimals-agnostic — the program treats this as a fixed scaling factor regardless
/// of the payment mint's decimals; u128 share storage absorbs any practical pool size.
pub const INITIAL_SHARES_PER_TOKEN_UNIT: u128 = 1_000_000;

pub const MAX_DAYS_PER_SUBSCRIPTION: u16 = 365;
/// Must be `<= MAX_TICKETS_PER_BATCH` because `process_subscription`
/// requires `picks.len() == daily_ticket_count` in a single transaction.
pub const MAX_DAILY_TICKETS_PER_SUB: u8 = 7;

/// Minimum BPS that must be reserved for the prize pool (after LP edge + referral fees).
/// Enforces the protocol's "70% to players" philosophy with a 50% absolute floor.
pub const MIN_PRIZE_POOL_BPS: u16 = 5_000;

/// Maximum BPS of LP NAV that may be reserved as a per-round guaranteed prize pool.
pub const MAX_GUARANTEE_PER_ROUND_BPS_CAP: u16 = 5_000;

/// URL prefix for trophy metadata. Format: `{prefix}/{round_id}/{winner_addr}`.
/// Hardcoded so external services (wallets, marketplaces, DAS API) can resolve
/// trophy assets without on-chain config lookups. Update for your deployment
/// before publishing the program.
pub const TROPHY_METADATA_URI_PREFIX: &str = "https://blinkpot.io/api/trophy-metadata";

pub fn switchboard_program_id() -> Pubkey {
    #[cfg(feature = "devnet")]
    {
        return switchboard_on_demand::ON_DEMAND_DEVNET_PID;
    }
    #[cfg(not(feature = "devnet"))]
    switchboard_on_demand::ON_DEMAND_MAINNET_PID
}
