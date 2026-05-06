use anchor_lang::prelude::*;

#[error_code]
pub enum LotteryError {
    #[msg("Caller is not the configured admin")]
    Unauthorized,
    #[msg("Protocol is paused")]
    Paused,
    #[msg("Emergency mode is active")]
    EmergencyMode,
    #[msg("Emergency mode is not active")]
    NotInEmergencyMode,

    #[msg("Invalid configuration parameters")]
    InvalidConfig,
    #[msg("Tier weight basis points sum must equal 10_000")]
    InvalidTierWeightBps,
    #[msg("Prize pool BPS falls below the protocol minimum")]
    PrizePoolBelowFloor,
    #[msg("Premium minimum allocation is out of range")]
    InvalidPremiumAllocation,
    #[msg("Round duration outside allowed range")]
    InvalidRoundDuration,
    #[msg("Bonusball max outside allowed range")]
    InvalidBonusballRange,
    #[msg("Ticket price must be positive")]
    InvalidTicketPrice,
    #[msg("Per-round guarantee exceeds the configured NAV cap")]
    GuaranteeExceedsCap,

    #[msg("Round is not in Open state")]
    RoundNotOpen,
    #[msg("Round draw time has not yet been reached")]
    DrawTimeNotReached,
    #[msg("Round is not awaiting reveal")]
    RoundNotDrawing,
    #[msg("Round is not in Claimable or Archived state")]
    RoundNotClaimable,
    #[msg("Round is not yet ready to be archived")]
    RoundNotArchivable,
    #[msg("A previous round must be settled before starting a new one")]
    PreviousRoundUnsettled,
    #[msg("Round id mismatch")]
    RoundIdMismatch,
    #[msg("No open round available for purchase")]
    NoOpenRound,

    #[msg("Ticket numbers must be sorted ascending and unique")]
    InvalidTicketNumbers,
    #[msg("Normal ball out of range")]
    NormalBallOutOfRange,
    #[msg("Bonusball out of range")]
    BonusballOutOfRange,
    #[msg("Batch size out of range")]
    InvalidBatchSize,

    #[msg("Ticket already claimed")]
    TicketAlreadyClaimed,
    #[msg("Tickets in tier 0 are not winners")]
    NotAWinningTier,
    #[msg("Tier has no winners")]
    NoTierWinners,
    #[msg("No winning tickets supplied")]
    NoWinningTickets,

    #[msg("Switchboard randomness account mismatch")]
    InvalidRandomnessAccount,
    #[msg("Switchboard randomness has already been revealed")]
    RandomnessAlreadyRevealed,
    #[msg("Switchboard randomness is not yet ready")]
    RandomnessNotResolved,
    #[msg("Switchboard randomness is stale")]
    RandomnessExpired,
    #[msg("Failed to derive winning numbers from randomness")]
    RandomnessDerivationFailed,
    #[msg("Active randomness commitment has not timed out")]
    RandomnessCommitStillActive,

    #[msg("LP cap would be exceeded")]
    LpCapExceeded,
    #[msg("LP position has insufficient shares")]
    LpInsufficientShares,
    #[msg("LP withdrawal already pending")]
    LpWithdrawalPending,
    #[msg("LP withdrawal not yet finalizable")]
    LpWithdrawalNotReady,
    #[msg("No pending LP withdrawal")]
    LpNoPendingWithdrawal,
    #[msg("Insufficient prize vault balance for payout")]
    PrizeVaultUnderfunded,
    #[msg("Insufficient LP principal for payout shortfall")]
    LpPrincipalUnderfunded,
    #[msg("Insufficient available LP liquidity for round guarantee")]
    LpGuaranteeUnavailable,

    #[msg("No referral fees to claim")]
    NoReferralFees,
    #[msg("Referrer cannot be the buyer")]
    SelfReferral,
    #[msg("Referral account is required")]
    ReferralRequired,
    #[msg("Parent referrer cannot be the referrer themself")]
    SelfParentReferrer,
    #[msg("Parent referrer account does not match the referrer's stored parent")]
    ParentReferrerMismatch,

    #[msg("Subscription is inactive or expired")]
    SubscriptionInactive,
    #[msg("Subscription ticket price changed")]
    SubscriptionPriceChanged,
    #[msg("Subscription already processed for this round")]
    SubscriptionAlreadyProcessed,
    #[msg("Subscription parameters out of range")]
    InvalidSubscription,

    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Token mint mismatch")]
    InvalidTokenMint,
    #[msg("Round is not in Emergency state")]
    RoundNotEmergency,

    #[msg("Pick counter PDA does not match the ticket's pick")]
    InvalidPickCounter,
}
