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
    #[msg("Tier payout basis points sum exceeds 10_000")]
    InvalidTierPayoutBps,
    #[msg("Round duration outside allowed range")]
    InvalidRoundDuration,
    #[msg("Bonusball max outside allowed range")]
    InvalidBonusballRange,
    #[msg("Ticket price must be positive")]
    InvalidTicketPrice,

    #[msg("Round is not in Open state")]
    RoundNotOpen,
    #[msg("Round draw time has not yet been reached")]
    DrawTimeNotReached,
    #[msg("Round is not awaiting reveal")]
    RoundNotDrawing,
    #[msg("Round is not in Settled state")]
    RoundNotSettled,
    #[msg("Not all tickets are registered yet")]
    UnregisteredTicketsRemain,
    #[msg("Round is not in Claimable or Archived state")]
    RoundNotClaimable,
    #[msg("Round is not yet ready to be archived")]
    RoundNotArchivable,
    #[msg("A previous round must be settled before starting a new one")]
    PreviousRoundUnsettled,
    #[msg("Round id mismatch")]
    RoundIdMismatch,

    #[msg("Ticket numbers must be sorted ascending and unique")]
    InvalidTicketNumbers,
    #[msg("Normal ball out of range")]
    NormalBallOutOfRange,
    #[msg("Bonusball out of range")]
    BonusballOutOfRange,
    #[msg("Batch size out of range")]
    InvalidBatchSize,

    #[msg("Ticket already registered")]
    TicketAlreadyRegistered,
    #[msg("Ticket already claimed")]
    TicketAlreadyClaimed,
    #[msg("Tier has no winners; tally first or nothing to claim")]
    NoTierWinners,
    #[msg("Tier has not been tallied yet")]
    TierNotTallied,
    #[msg("Tickets in tier 0 are not winners")]
    NotAWinningTier,

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

    #[msg("No referral fees to claim")]
    NoReferralFees,
    #[msg("Referrer cannot be the buyer")]
    SelfReferral,

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
}
