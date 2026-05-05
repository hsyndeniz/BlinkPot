use anchor_lang::prelude::*;

use crate::constants::{
    BPS_DENOM, INITIAL_SHARES_PER_USDC, NORMAL_BALL_COUNT, NORMAL_BALL_MIN, SHARE_SCALE, TIER_COUNT,
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

pub fn validate_tier_payout_bps(tier_payout_bps: &[u16; TIER_COUNT]) -> Result<()> {
    let mut sum: u32 = 0;
    for v in tier_payout_bps.iter() {
        sum = sum
            .checked_add(*v as u32)
            .ok_or(error!(LotteryError::MathOverflow))?;
    }
    require!(sum <= BPS_DENOM as u32, LotteryError::InvalidTierPayoutBps);
    require!(tier_payout_bps[0] == 0, LotteryError::InvalidTierPayoutBps);
    Ok(())
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
}

pub fn calculate_tally_outcome(
    prize_pool: u64,
    seed_prize_pool: u64,
    ticket_prize_pool: u64,
    lp_guarantee_reserved: u64,
    tier_winner_counts: &[u32; TIER_COUNT],
    tier_payout_bps: &[u16; TIER_COUNT],
    untaken_tier_destination: UntakenTierDestination,
) -> Result<TallyOutcome> {
    let mut winner_liability: u64 = 0;
    let mut tier_pool_amounts = [0u64; TIER_COUNT];

    for t in 1..TIER_COUNT {
        let bps = tier_payout_bps[t];
        if bps == 0 || tier_winner_counts[t] == 0 {
            continue;
        }
        let count = tier_winner_counts[t] as u64;
        let pool_for_tier = bps_amount(prize_pool, bps)?;
        let payable_per_winner = pool_for_tier / count;
        let payable_pool = payable_per_winner
            .checked_mul(count)
            .ok_or(error!(LotteryError::MathOverflow))?;
        tier_pool_amounts[t] = payable_pool;
        winner_liability = winner_liability
            .checked_add(payable_pool)
            .ok_or(error!(LotteryError::MathOverflow))?;
    }

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
    })
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

    #[test]
    fn tally_uses_player_assets_before_lp_guarantee() {
        let mut counts = [0u32; TIER_COUNT];
        counts[11] = 1;
        let mut bps = [0u16; TIER_COUNT];
        bps[11] = 7_000;

        let out = calculate_tally_outcome(
            2_000_000,
            100_000,
            400_000,
            1_500_000,
            &counts,
            &bps,
            UntakenTierDestination::NextRound,
        )
        .unwrap();

        assert_eq!(out.tier_pool_amounts[11], 1_400_000);
        assert_eq!(out.player_funded_prizes, 500_000);
        assert_eq!(out.lp_loss_reserved, 900_000);
        assert_eq!(out.unused_guarantee, 600_000);
        assert_eq!(out.rolled_to_next_round, 0);
    }

    #[test]
    fn tally_rolls_only_unused_player_assets() {
        let counts = [0u32; TIER_COUNT];
        let mut bps = [0u16; TIER_COUNT];
        bps[11] = 7_000;

        let out = calculate_tally_outcome(
            2_000_000,
            100_000,
            400_000,
            1_500_000,
            &counts,
            &bps,
            UntakenTierDestination::NextRound,
        )
        .unwrap();

        assert_eq!(out.winner_liability, 0);
        assert_eq!(out.lp_loss_reserved, 0);
        assert_eq!(out.unused_guarantee, 1_500_000);
        assert_eq!(out.rolled_to_next_round, 500_000);
    }

    #[test]
    fn tally_sends_unused_player_assets_to_lp_when_configured() {
        let counts = [0u32; TIER_COUNT];
        let mut bps = [0u16; TIER_COUNT];
        bps[11] = 7_000;

        let out = calculate_tally_outcome(
            2_000_000,
            100_000,
            400_000,
            1_500_000,
            &counts,
            &bps,
            UntakenTierDestination::LpPool,
        )
        .unwrap();

        assert_eq!(out.rolled_to_lp, 500_000);
        assert_eq!(out.rolled_to_next_round, 0);
        assert_eq!(out.unused_guarantee, 1_500_000);
    }
}
