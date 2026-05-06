use anchor_lang::prelude::*;

use crate::constants::{
    BPS_DENOM, INITIAL_SHARES_PER_USDC, MAX_BONUSBALL_MAX, MIN_BONUSBALL_MAX, NORMAL_BALL_COUNT,
    NORMAL_BALL_MIN, SHARE_SCALE, TIER_COUNT,
};
use crate::errors::LotteryError;
use crate::state::config::UntakenTierDestination;

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

/// Validates that tier weight bps[0] = 0 and the sum of all bps = exactly 10_000.
pub fn validate_tier_weight_bps(tier_premium_weight_bps: &[u16; TIER_COUNT]) -> Result<()> {
    require!(
        tier_premium_weight_bps[0] == 0,
        LotteryError::InvalidTierWeightBps
    );
    let mut sum: u32 = 0;
    for v in tier_premium_weight_bps.iter() {
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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TallyOutcome {
    pub tier_pool_amounts: [u64; TIER_COUNT],
    pub winner_liability: u64,
    pub player_funded_prizes: u64,
    pub lp_loss_reserved: u64,
    pub unused_guarantee: u64,
    pub rolled_to_lp: u64,
    pub rolled_to_next_round: u64,
    pub min_payouts_total: u64,
    pub premium_payouts_total: u64,
    pub used_minimum_payouts: bool,
}

/// Compute final tier pool amounts using the Megapot two-tier payout model:
///   - guaranteed minimum per winner per tier (if affordable)
///   - remaining pool distributed by per-tier premium weights
///
/// If guaranteed minimums would consume the prize pool such that the premium pool
/// falls below `premium_min_allocation_bps` of the total, the system skips guaranteed
/// minimums and pays purely by premium weights — preserving solvency and headline payouts.
pub fn calculate_tally_outcome(
    prize_pool: u64,
    seed_prize_pool: u64,
    ticket_prize_pool: u64,
    lp_guarantee_reserved: u64,
    tier_winner_counts: &[u32; TIER_COUNT],
    tier_premium_weight_bps: &[u16; TIER_COUNT],
    tier_min_payout_per_winner: &[u64; TIER_COUNT],
    premium_min_allocation_bps: u16,
    untaken_tier_destination: UntakenTierDestination,
) -> Result<TallyOutcome> {
    let mut tier_pool_amounts = [0u64; TIER_COUNT];

    // Step 1 — sum guaranteed-minimum allocation
    let mut min_alloc_total: u64 = 0;
    for t in 1..TIER_COUNT {
        let count = tier_winner_counts[t] as u64;
        if count == 0 {
            continue;
        }
        let per_winner = tier_min_payout_per_winner[t];
        if per_winner == 0 {
            continue;
        }
        let tier_min = per_winner
            .checked_mul(count)
            .ok_or(error!(LotteryError::MathOverflow))?;
        min_alloc_total = min_alloc_total
            .checked_add(tier_min)
            .ok_or(error!(LotteryError::MathOverflow))?;
    }

    // Step 2 — premium floor required after guaranteed minimums
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

    // Step 3 — distribute premium pool by tier weights and add minimums (if used)
    let mut min_payouts_total: u64 = 0;
    let mut premium_payouts_total: u64 = 0;
    let mut winner_liability: u64 = 0;

    for t in 1..TIER_COUNT {
        let count = tier_winner_counts[t] as u64;
        if count == 0 {
            continue;
        }
        let weight = tier_premium_weight_bps[t];

        let premium_for_tier = if weight == 0 {
            0
        } else {
            bps_amount(premium_pool, weight)?
        };
        let premium_per_winner = if count > 0 { premium_for_tier / count } else { 0 };
        let premium_payable = premium_per_winner
            .checked_mul(count)
            .ok_or(error!(LotteryError::MathOverflow))?;

        let min_per_winner = if used_minimum_payouts {
            tier_min_payout_per_winner[t]
        } else {
            0
        };
        let min_payable = min_per_winner
            .checked_mul(count)
            .ok_or(error!(LotteryError::MathOverflow))?;

        let tier_total = premium_payable
            .checked_add(min_payable)
            .ok_or(error!(LotteryError::MathOverflow))?;
        tier_pool_amounts[t] = tier_total;

        premium_payouts_total = premium_payouts_total
            .checked_add(premium_payable)
            .ok_or(error!(LotteryError::MathOverflow))?;
        min_payouts_total = min_payouts_total
            .checked_add(min_payable)
            .ok_or(error!(LotteryError::MathOverflow))?;
        winner_liability = winner_liability
            .checked_add(tier_total)
            .ok_or(error!(LotteryError::MathOverflow))?;
    }

    // Step 4 — split between player-funded and LP-funded, route unused
    let player_assets = seed_prize_pool
        .checked_add(ticket_prize_pool)
        .ok_or(error!(LotteryError::MathOverflow))?;
    let player_funded_prizes = winner_liability.min(player_assets);
    let lp_loss_reserved = winner_liability
        .checked_sub(player_funded_prizes)
        .ok_or(error!(LotteryError::MathOverflow))?;
    require!(
        lp_loss_reserved <= lp_guarantee_reserved,
        LotteryError::LpPrincipalUnderfunded
    );

    let unused_player_assets = player_assets
        .checked_sub(player_funded_prizes)
        .ok_or(error!(LotteryError::MathOverflow))?;
    let unused_guarantee = lp_guarantee_reserved
        .checked_sub(lp_loss_reserved)
        .ok_or(error!(LotteryError::MathOverflow))?;

    let (rolled_to_lp, rolled_to_next_round) = match untaken_tier_destination {
        UntakenTierDestination::LpPool => (unused_player_assets, 0),
        UntakenTierDestination::NextRound => (0, unused_player_assets),
    };

    Ok(TallyOutcome {
        tier_pool_amounts,
        winner_liability,
        player_funded_prizes,
        lp_loss_reserved,
        unused_guarantee,
        rolled_to_lp,
        rolled_to_next_round,
        min_payouts_total,
        premium_payouts_total,
        used_minimum_payouts,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn weights_jackpot_only() -> [u16; TIER_COUNT] {
        let mut w = [0u16; TIER_COUNT];
        w[11] = 10_000;
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
        validate_tier_weight_bps(&w).unwrap();

        let mut w2 = [0u16; TIER_COUNT];
        w2[11] = 9_000;
        assert!(validate_tier_weight_bps(&w2).is_err());
    }

    #[test]
    fn dynamic_bonusball_clamps() {
        assert_eq!(compute_dynamic_bonusball(0, 5, 10_000_000_000), 5);
        assert_eq!(compute_dynamic_bonusball(50_000_000_000, 5, 10_000_000_000), 10);
        assert_eq!(compute_dynamic_bonusball(u64::MAX, 5, 10_000_000_000), 64);
    }

    #[test]
    fn tally_premium_only_path_when_no_minimums() {
        let mut counts = [0u32; TIER_COUNT];
        counts[11] = 1;
        let out = calculate_tally_outcome(
            2_000_000,
            100_000,
            400_000,
            1_500_000,
            &counts,
            &weights_jackpot_only(),
            &no_mins(),
            0,
            UntakenTierDestination::NextRound,
        )
        .unwrap();
        assert!(!out.used_minimum_payouts);
        assert_eq!(out.tier_pool_amounts[11], 2_000_000);
        assert_eq!(out.player_funded_prizes, 500_000);
        assert_eq!(out.lp_loss_reserved, 1_500_000);
    }

    #[test]
    fn tally_minimums_when_affordable() {
        let mut counts = [0u32; TIER_COUNT];
        counts[3] = 2;
        counts[11] = 1;

        let mut weights = [0u16; TIER_COUNT];
        weights[3] = 1_000;
        weights[11] = 9_000;

        let mut mins = [0u64; TIER_COUNT];
        mins[3] = 1_000_000; // 1 USDC
        mins[11] = 0;

        let out = calculate_tally_outcome(
            100_000_000, // 100 USDC
            0,
            100_000_000,
            0,
            &counts,
            &weights,
            &mins,
            2_000, // require 20% premium floor
            UntakenTierDestination::NextRound,
        )
        .unwrap();
        assert!(out.used_minimum_payouts);
        assert_eq!(out.min_payouts_total, 2_000_000);
        // premium_pool = 100M - 2M = 98M
        // tier 3: 10% * 98M / 2 = 4.9M each, 9.8M total + 2M min = 11.8M
        // tier 11: 90% * 98M / 1 = 88.2M
        assert_eq!(out.tier_pool_amounts[3], 11_800_000);
        assert_eq!(out.tier_pool_amounts[11], 88_200_000);
    }

    #[test]
    fn tally_skips_minimums_when_pool_too_small() {
        let mut counts = [0u32; TIER_COUNT];
        counts[3] = 1_000;
        counts[11] = 0;

        let mut weights = [0u16; TIER_COUNT];
        weights[3] = 5_000;
        weights[11] = 5_000;

        let mut mins = [0u64; TIER_COUNT];
        mins[3] = 1_000_000;

        let out = calculate_tally_outcome(
            500_000_000,
            0,
            500_000_000,
            0,
            &counts,
            &weights,
            &mins,
            2_000,
            UntakenTierDestination::NextRound,
        )
        .unwrap();
        // 1000 winners * 1 USDC = 1000 USDC = 1B units > pool. Skip mins.
        assert!(!out.used_minimum_payouts);
        assert_eq!(out.min_payouts_total, 0);
    }
}
