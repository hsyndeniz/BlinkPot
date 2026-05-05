use anchor_lang::prelude::*;

use crate::constants::{
    BPS_DENOM, INITIAL_SHARES_PER_USDC, NORMAL_BALL_COUNT, NORMAL_BALL_MIN, SHARE_SCALE, TIER_COUNT,
};
use crate::errors::LotteryError;

pub fn validate_pick(
    normals: &[u8; NORMAL_BALL_COUNT],
    bonusball: u8,
    normal_ball_max: u8,
    bonusball_max: u8,
) -> Result<()> {
    require!(bonusball >= 1 && bonusball <= bonusball_max, LotteryError::BonusballOutOfRange);
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
    require!(normal_ball_max as usize >= NORMAL_BALL_COUNT, LotteryError::InvalidConfig);
    require!(bonusball_max >= 1, LotteryError::InvalidConfig);

    // Rejection-sampling threshold for unbiased modulo.
    // Plain `byte % range` is biased when 256 isn't divisible by range: the first
    // (256 % range) values each appear one extra time. Rejecting bytes >= threshold
    // ensures all accepted bytes map uniformly. For range=30: threshold=240 (~6.25% reject).
    let normal_range = normal_ball_max as u16;
    let normal_threshold = 256u16 - (256u16 % normal_range);

    let mut chosen: [u8; NORMAL_BALL_COUNT] = [0; NORMAL_BALL_COUNT];
    let mut found = 0usize;
    let mut idx = 0usize;

    // Allow up to 4 passes over the 32 bytes (128 virtual bytes).
    // With ~6.25% rejection and 5 unique picks from 30, this is far more than enough.
    while found < NORMAL_BALL_COUNT {
        if idx >= randomness_bytes.len() * 4 {
            return Err(error!(LotteryError::RandomnessDerivationFailed));
        }
        let raw = randomness_bytes[idx % randomness_bytes.len()];
        // XOR each pass with a different constant so successive passes yield distinct values.
        let pass = (idx / randomness_bytes.len()) as u8;
        let b = raw ^ pass.wrapping_mul(37u8);
        idx += 1;

        // Skip bytes in the biased tail.
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

    // Bonus ball: rejection-sample from bytes starting at index 31, stepping backward,
    // with a per-attempt XOR derivation to diversify. For bonusball_max=15 the threshold
    // is 255, meaning only 1 byte in 256 is rejected, so the first attempt almost always
    // succeeds.
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
    // Extremely unlikely fallback (all 8 attempts rejected — would require bonusball_max
    // close to 256 with a very unlucky byte sequence). Biased by at most 1 unit.
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

pub fn assets_for_shares(
    shares: u128,
    total_shares: u128,
    total_assets: u64,
) -> Result<u64> {
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

pub fn validate_tier_payout_bps(tier_payout_bps: &[u16; TIER_COUNT]) -> Result<()> {
    let mut sum: u32 = 0;
    for v in tier_payout_bps.iter() {
        sum = sum.checked_add(*v as u32).ok_or(error!(LotteryError::MathOverflow))?;
    }
    require!(sum <= BPS_DENOM as u32, LotteryError::InvalidTierPayoutBps);
    require!(tier_payout_bps[0] == 0, LotteryError::InvalidTierPayoutBps);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn count_matches_no_overlap() {
        let t = [2u8, 4, 6, 8, 10];
        let w = [1u8, 3, 5, 7, 9];
        let (m, b) = count_matches(&t, 1, &w, 2);
        assert_eq!(m, 0);
        assert!(!b);
        assert_eq!(tier_for_match(m, b), 0);
    }

    #[test]
    fn tier_mapping_full() {
        assert_eq!(tier_for_match(0, false), 0);
        assert_eq!(tier_for_match(0, true), 1);
        assert_eq!(tier_for_match(5, true), 11);
        assert_eq!(tier_for_match(5, false), 10);
    }

    #[test]
    fn derive_winning_numbers_unique() {
        let bytes: [u8; 32] = [
            0x01, 0x05, 0x0a, 0x0f, 0x14, 0x19, 0x1e, 0x05,
            0x0a, 0x0f, 0x42, 0x99, 0x77, 0x33, 0x55, 0xaa,
            0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88,
            0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x07,
        ];
        let (normals, bonus) = derive_winning_numbers(&bytes, 30, 15).unwrap();
        let mut seen = [false; 64];
        for &n in normals.iter() {
            assert!(n >= 1 && n <= 30);
            assert!(!seen[n as usize]);
            seen[n as usize] = true;
        }
        assert!(bonus >= 1 && bonus <= 15);
        let mut sorted = normals;
        sorted.sort();
        assert_eq!(sorted, normals);
    }

    #[test]
    fn share_math_initial() {
        let s = shares_for_deposit(1_000_000, 0, 0).unwrap();
        assert_eq!(s, 1_000_000u128 * INITIAL_SHARES_PER_USDC);
    }

    #[test]
    fn share_math_round_trip() {
        let s = shares_for_deposit(1_000_000, 0, 0).unwrap();
        let assets = assets_for_shares(s, s, 1_000_000).unwrap();
        assert_eq!(assets, 1_000_000);
    }

    #[test]
    fn validate_tier_caps() {
        let mut bps = [0u16; TIER_COUNT];
        bps[1] = 200;
        bps[3] = 300;
        bps[5] = 500;
        bps[11] = 5_000;
        validate_tier_payout_bps(&bps).unwrap();
    }

    #[test]
    fn validate_tier_rejects_overflow() {
        let mut bps = [0u16; TIER_COUNT];
        bps[1] = 5_000;
        bps[11] = 6_000;
        assert!(validate_tier_payout_bps(&bps).is_err());
    }
}
