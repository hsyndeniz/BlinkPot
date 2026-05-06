use anchor_lang::prelude::*;

use crate::constants::{
    BPS_DENOM, INITIAL_SHARES_PER_USDC, MAX_BONUSBALL_MAX, MIN_BONUSBALL_MAX, NORMAL_BALL_COUNT,
    NORMAL_BALL_MIN, SHARE_SCALE, TIER_COUNT,
};
use crate::errors::LotteryError;

pub fn validate_pick(
    normals: &[u8; NORMAL_BALL_COUNT],
    bonusball: u8,
    normal_ball_max: u8,
    bonusball_max: u8,
) -> Result<()> {
    require!(
        bonusball >= 1 && bonusball <= bonusball_max,
        LotteryError::BonusballOutOfRange
    );
    let mut prev: u8 = 0;
    for &n in normals.iter() {
        require!(
            n >= NORMAL_BALL_MIN && n <= normal_ball_max,
            LotteryError::NormalBallOutOfRange
        );
        require!(n > prev, LotteryError::InvalidTicketNumbers);
        prev = n;
    }
    Ok(())
}

pub fn count_matches(
    ticket_normals: &[u8; NORMAL_BALL_COUNT],
    ticket_bonus: u8,
    winning_normals: &[u8; NORMAL_BALL_COUNT],
    winning_bonus: u8,
) -> (u8, bool) {
    let mut matches: u8 = 0;
    let mut i = 0usize;
    let mut j = 0usize;
    while i < NORMAL_BALL_COUNT && j < NORMAL_BALL_COUNT {
        let a = ticket_normals[i];
        let b = winning_normals[j];
        if a == b {
            matches += 1;
            i += 1;
            j += 1;
        } else if a < b {
            i += 1;
        } else {
            j += 1;
        }
    }
    (matches, ticket_bonus == winning_bonus)
}

pub fn tier_for_match(matches: u8, has_bonus: bool) -> u8 {
    match (matches, has_bonus) {
        (0, false) => 0,
        (0, true) => 1,
        (1, false) => 2,
        (1, true) => 3,
        (2, false) => 4,
        (2, true) => 5,
        (3, false) => 6,
        (3, true) => 7,
        (4, false) => 8,
        (4, true) => 9,
        (5, false) => 10,
        (5, true) => 11,
        _ => 0,
    }
}

pub fn derive_winning_numbers(
    randomness_bytes: &[u8; 32],
    normal_ball_max: u8,
    bonusball_max: u8,
) -> Result<([u8; NORMAL_BALL_COUNT], u8)> {
    require!(
        normal_ball_max as usize >= NORMAL_BALL_COUNT,
        LotteryError::InvalidConfig
    );
    require!(bonusball_max >= 1, LotteryError::InvalidConfig);

    let normal_range = normal_ball_max as u16;
    let normal_threshold = 256u16 - (256u16 % normal_range);

    let mut chosen: [u8; NORMAL_BALL_COUNT] = [0; NORMAL_BALL_COUNT];
    let mut found = 0usize;
    let mut idx = 0usize;

    while found < NORMAL_BALL_COUNT {
        if idx >= randomness_bytes.len() * 4 {
            return Err(error!(LotteryError::RandomnessDerivationFailed));
        }
        let raw = randomness_bytes[idx % randomness_bytes.len()];
        let pass = (idx / randomness_bytes.len()) as u8;
        let b = raw ^ pass.wrapping_mul(37u8);
        idx += 1;

        if (b as u16) >= normal_threshold {
            continue;
        }
        let candidate = NORMAL_BALL_MIN + (b % normal_ball_max);
        if !chosen[..found].contains(&candidate) {
            chosen[found] = candidate;
            found += 1;
        }
    }
    chosen[..NORMAL_BALL_COUNT].sort();

    let bonus_range = bonusball_max as u16;
    let bonus_threshold = 256u16 - (256u16 % bonus_range);
    let mut bonus: u8 = 0;
    for attempt in 0u8..8u8 {
        let raw = randomness_bytes[31usize - (attempt as usize % 32)];
        let b = raw ^ attempt.wrapping_mul(53u8);
        if (b as u16) < bonus_threshold {
            bonus = 1 + (b % bonusball_max);
            break;
        }
    }
    if bonus == 0 {
        bonus = 1 + (randomness_bytes[31] % bonusball_max);
    }

    Ok((chosen, bonus))
}

pub fn shares_for_deposit(
    deposit_amount: u64,
    total_shares: u128,
    total_assets: u64,
) -> Result<u128> {
    if total_shares == 0 || total_assets == 0 {
        return (deposit_amount as u128)
            .checked_mul(INITIAL_SHARES_PER_USDC)
            .ok_or(error!(LotteryError::MathOverflow));
    }
    let numerator = (deposit_amount as u128)
        .checked_mul(total_shares)
        .ok_or(error!(LotteryError::MathOverflow))?;
    Ok(numerator / total_assets as u128)
}

pub fn assets_for_shares(shares: u128, total_shares: u128, total_assets: u64) -> Result<u64> {
    if total_shares == 0 {
        return Ok(0);
    }
    let numerator = shares
        .checked_mul(total_assets as u128)
        .ok_or(error!(LotteryError::MathOverflow))?;
    let assets = numerator / total_shares;
    u64::try_from(assets).map_err(|_| error!(LotteryError::MathOverflow))
}

pub fn share_price_q(total_shares: u128, total_assets: u64) -> u128 {
    if total_shares == 0 {
        return SHARE_SCALE;
    }
    (total_assets as u128)
        .saturating_mul(SHARE_SCALE)
        .checked_div(total_shares)
        .unwrap_or(SHARE_SCALE)
}

pub fn bps_amount(amount: u64, bps: u16) -> Result<u64> {
    let numerator = (amount as u128)
        .checked_mul(bps as u128)
        .ok_or(error!(LotteryError::MathOverflow))?;
    Ok((numerator / BPS_DENOM as u128) as u64)
}

/// Validates that tier weight bps sum to exactly 10_000 and that any non-winning
/// tier has zero weight (it can never receive premium).
pub fn validate_tier_weight_bps(
    tier_premium_weight_bps: &[u16; TIER_COUNT],
    tier_is_winning: &[bool; TIER_COUNT],
) -> Result<()> {
    let mut sum: u32 = 0;
    for (t, v) in tier_premium_weight_bps.iter().enumerate() {
        if !tier_is_winning[t] {
            require!(*v == 0, LotteryError::InvalidTierWeightBps);
        }
        sum = sum
            .checked_add(*v as u32)
            .ok_or(error!(LotteryError::MathOverflow))?;
    }
    require!(
        sum == BPS_DENOM as u32,
        LotteryError::InvalidTierWeightBps
    );
    Ok(())
}

/// Compute the bonusball maximum based on the prize pool.
/// `base + (pool_usdc / step)` clamped to [MIN_BONUSBALL_MAX, MAX_BONUSBALL_MAX].
pub fn compute_dynamic_bonusball(prize_pool_usdc: u64, base: u8, step: u64) -> u8 {
    if step == 0 {
        return base.max(MIN_BONUSBALL_MAX).min(MAX_BONUSBALL_MAX);
    }
    let extra = prize_pool_usdc / step;
    let raw = (base as u64).saturating_add(extra);
    let clamped = raw.min(MAX_BONUSBALL_MAX as u64);
    let result = clamped.max(MIN_BONUSBALL_MAX as u64);
    result as u8
}

/// Number of normal-ball combinations matching exactly `m` of the 5 winning normals
/// out of `normal_max` total balls: C(5, m) * C(normal_max - 5, 5 - m).
fn normal_match_combos(m: u8, normal_max: u8) -> u64 {
    let total = normal_max as u64;
    let winning = NORMAL_BALL_COUNT as u64;
    let losing = total.saturating_sub(winning);
    binomial(winning, m as u64).saturating_mul(binomial(losing, winning - m as u64))
}

/// Total number of distinct (5 normals, 1 bonus) tickets that fall into the tier
/// `(matches=m, has_bonus)` given the current `normal_max` and `bonus_max`.
pub fn tier_combos(m: u8, has_bonus: bool, normal_max: u8, bonus_max: u8) -> u64 {
    let normal_combos = normal_match_combos(m, normal_max);
    let bonus_factor = if has_bonus {
        1
    } else {
        (bonus_max as u64).saturating_sub(1)
    };
    normal_combos.saturating_mul(bonus_factor)
}

/// Combinations indexed by tier id (`tier_for_match` ordering).
pub fn tier_combos_table(normal_max: u8, bonus_max: u8) -> [u64; TIER_COUNT] {
    let mut out = [0u64; TIER_COUNT];
    for m in 0u8..=NORMAL_BALL_COUNT as u8 {
        let no_bonus = tier_for_match(m, false) as usize;
        let with_bonus = tier_for_match(m, true) as usize;
        out[no_bonus] = tier_combos(m, false, normal_max, bonus_max);
        out[with_bonus] = tier_combos(m, true, normal_max, bonus_max);
    }
    out
}

fn binomial(n: u64, k: u64) -> u64 {
    if k > n {
        return 0;
    }
    let k = k.min(n - k);
    let mut result: u128 = 1;
    for i in 0..k {
        result = result * (n as u128 - i as u128) / (i as u128 + 1);
    }
    result as u64
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PayoutPlan {
    pub payout_per_winner: [u64; TIER_COUNT],
    pub used_minimum_payouts: bool,
}

/// Compute the fixed per-winner payout for each tier, given the frozen prize pool and
/// configured weights/minimums. The split between guaranteed minimums and premium pool
/// is decided once here, at reveal time, using the Megapot two-step model:
///
///   1. min_alloc_total = sum over winning tiers of `min[t] * combos[t]`
///      (combinatorial worst case — every possible winning combo is sold once).
///   2. If `min_alloc_total + premium_floor <= prize_pool`, mins are used and
///      `premium_pool = prize_pool - min_alloc_total`. Otherwise mins are skipped
///      (`premium_pool = prize_pool`).
///   3. For each winning tier:
///        payout_per_winner[t] = min_effective[t] + (premium_pool * weight[t] / 10000) / combos[t]
///
/// Non-winning tiers (and tiers with zero combos) get payout 0.
pub fn compute_payouts_per_winner(
    prize_pool: u64,
    normal_max: u8,
    bonus_max: u8,
    tier_is_winning: &[bool; TIER_COUNT],
    tier_premium_weight_bps: &[u16; TIER_COUNT],
    tier_min_payout_per_winner: &[u64; TIER_COUNT],
    premium_min_allocation_bps: u16,
) -> Result<PayoutPlan> {
    let combos = tier_combos_table(normal_max, bonus_max);

    // Step 1 — sum potential guaranteed-minimum allocation (across winning tiers).
    let mut min_alloc_total: u64 = 0;
    for t in 0..TIER_COUNT {
        if !tier_is_winning[t] {
            continue;
        }
        let m = tier_min_payout_per_winner[t];
        if m == 0 || combos[t] == 0 {
            continue;
        }
        let tier_min = m
            .checked_mul(combos[t])
            .ok_or(error!(LotteryError::MathOverflow))?;
        min_alloc_total = min_alloc_total
            .checked_add(tier_min)
            .ok_or(error!(LotteryError::MathOverflow))?;
    }

    // Step 2 — decide whether minimums fit alongside the required premium floor.
    let premium_floor = bps_amount(prize_pool, premium_min_allocation_bps)?;
    let mins_fit = min_alloc_total
        .checked_add(premium_floor)
        .map(|sum| sum <= prize_pool)
        .unwrap_or(false);
    let used_minimum_payouts = mins_fit && min_alloc_total > 0;
    let premium_pool = if used_minimum_payouts {
        prize_pool
            .checked_sub(min_alloc_total)
            .ok_or(error!(LotteryError::MathOverflow))?
    } else {
        prize_pool
    };

    // Step 3 — per-winner payout per tier.
    let mut payout = [0u64; TIER_COUNT];
    for t in 0..TIER_COUNT {
        if !tier_is_winning[t] || combos[t] == 0 {
            continue;
        }
        let weight = tier_premium_weight_bps[t];
        let tier_premium = if weight == 0 {
            0
        } else {
            bps_amount(premium_pool, weight)?
        };
        let premium_per_winner = tier_premium / combos[t];
        let min_per_winner = if used_minimum_payouts {
            tier_min_payout_per_winner[t]
        } else {
            0
        };
        payout[t] = premium_per_winner
            .checked_add(min_per_winner)
            .ok_or(error!(LotteryError::MathOverflow))?;
    }

    Ok(PayoutPlan {
        payout_per_winner: payout,
        used_minimum_payouts,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants::{MEGAPOT_TIER_IS_WINNING, MEGAPOT_TIER_PREMIUM_WEIGHT_BPS};

    fn weights_jackpot_only() -> [u16; TIER_COUNT] {
        let mut w = [0u16; TIER_COUNT];
        w[11] = 10_000;
        w
    }

    fn all_winning() -> [bool; TIER_COUNT] {
        let mut w = [false; TIER_COUNT];
        for t in 1..TIER_COUNT {
            w[t] = true;
        }
        w
    }

    fn no_mins() -> [u64; TIER_COUNT] {
        [0u64; TIER_COUNT]
    }

    #[test]
    fn count_matches_full() {
        let t = [1u8, 5, 10, 20, 30];
        let w = [1u8, 5, 10, 20, 30];
        let (m, b) = count_matches(&t, 7, &w, 7);
        assert_eq!(m, 5);
        assert!(b);
        assert_eq!(tier_for_match(m, b), 11);
    }

    #[test]
    fn count_matches_partial() {
        let t = [1u8, 5, 10, 15, 20];
        let w = [1u8, 5, 11, 16, 21];
        let (m, b) = count_matches(&t, 7, &w, 8);
        assert_eq!(m, 2);
        assert!(!b);
        assert_eq!(tier_for_match(m, b), 4);
    }

    #[test]
    fn derive_winning_numbers_unique() {
        let bytes: [u8; 32] = [
            0x01, 0x05, 0x0a, 0x0f, 0x14, 0x19, 0x1e, 0x05, 0x0a, 0x0f, 0x42, 0x99, 0x77, 0x33,
            0x55, 0xaa, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc,
            0xdd, 0xee, 0xff, 0x07,
        ];
        let (normals, bonus) = derive_winning_numbers(&bytes, 30, 15).unwrap();
        let mut seen = [false; 64];
        for &n in normals.iter() {
            assert!(n >= 1 && n <= 30);
            assert!(!seen[n as usize]);
            seen[n as usize] = true;
        }
        assert!(bonus >= 1 && bonus <= 15);
    }

    #[test]
    fn share_math_round_trip() {
        let s = shares_for_deposit(1_000_000, 0, 0).unwrap();
        let assets = assets_for_shares(s, s, 1_000_000).unwrap();
        assert_eq!(assets, 1_000_000);
    }

    #[test]
    fn validate_weights_must_sum_to_10000() {
        let mut w = [0u16; TIER_COUNT];
        w[11] = 5_000;
        w[10] = 5_000;
        validate_tier_weight_bps(&w, &all_winning()).unwrap();

        let mut w2 = [0u16; TIER_COUNT];
        w2[11] = 9_000;
        assert!(validate_tier_weight_bps(&w2, &all_winning()).is_err());
    }

    #[test]
    fn validate_weights_rejects_premium_for_non_winning_tier() {
        let mut w = [0u16; TIER_COUNT];
        // give some weight to tier 0 which is non-winning by Megapot defaults
        w[0] = 1_000;
        w[11] = 9_000;
        assert!(validate_tier_weight_bps(&w, &MEGAPOT_TIER_IS_WINNING).is_err());
    }

    #[test]
    fn dynamic_bonusball_clamps() {
        assert_eq!(compute_dynamic_bonusball(0, 5, 10_000_000_000), 5);
        assert_eq!(compute_dynamic_bonusball(50_000_000_000, 5, 10_000_000_000), 10);
        assert_eq!(compute_dynamic_bonusball(u64::MAX, 5, 10_000_000_000), 64);
    }

    #[test]
    fn binomial_basic() {
        assert_eq!(binomial(5, 0), 1);
        assert_eq!(binomial(5, 5), 1);
        assert_eq!(binomial(5, 2), 10);
        assert_eq!(binomial(25, 5), 53_130);
        assert_eq!(binomial(30, 5), 142_506);
    }

    #[test]
    fn combos_jackpot() {
        // 5 matches + bonus on 1-30 normals, 1-15 bonus: only 1 winning combo
        assert_eq!(tier_combos(5, true, 30, 15), 1);
        // 5 matches no bonus: 1 way for normals * 14 non-winning bonus values
        assert_eq!(tier_combos(5, false, 30, 15), 14);
        // 0 matches no bonus: C(5,0)*C(25,5) * 14 = 53130 * 14
        assert_eq!(tier_combos(0, false, 30, 15), 53_130 * 14);
    }

    #[test]
    fn payout_premium_only_path() {
        let plan = compute_payouts_per_winner(
            1_000_000_000,
            30,
            15,
            &MEGAPOT_TIER_IS_WINNING,
            &weights_jackpot_only(),
            &no_mins(),
            0,
        )
        .unwrap();
        assert!(!plan.used_minimum_payouts);
        // jackpot: 100% of 1B / 1 combo = 1B
        assert_eq!(plan.payout_per_winner[11], 1_000_000_000);
        // tier 0 non-winning -> 0
        assert_eq!(plan.payout_per_winner[0], 0);
        assert_eq!(plan.payout_per_winner[2], 0);
    }

    #[test]
    fn payout_uses_megapot_default_weights() {
        let plan = compute_payouts_per_winner(
            1_000_000_000,
            30,
            15,
            &MEGAPOT_TIER_IS_WINNING,
            &MEGAPOT_TIER_PREMIUM_WEIGHT_BPS,
            &no_mins(),
            0,
        )
        .unwrap();
        // jackpot tier (5+B): 4000bps of 1B = 400M, 1 combo => 400M per winner
        assert_eq!(plan.payout_per_winner[11], 400_000_000);
        // 5 no bonus: 600bps of 1B = 60M, 14 combos => 4_285_714
        assert_eq!(plan.payout_per_winner[10], 60_000_000 / 14);
    }

    #[test]
    fn payout_skips_minimums_when_too_large() {
        // huge per-tier minimum, small pool — minimums won't fit, fall back to premium-only.
        let mut mins = [0u64; TIER_COUNT];
        mins[1] = 1_000_000_000; // 1000 USDC for the bonusball-only tier
        let plan = compute_payouts_per_winner(
            10_000_000,
            30,
            15,
            &MEGAPOT_TIER_IS_WINNING,
            &MEGAPOT_TIER_PREMIUM_WEIGHT_BPS,
            &mins,
            2_000,
        )
        .unwrap();
        assert!(!plan.used_minimum_payouts);
    }
}
