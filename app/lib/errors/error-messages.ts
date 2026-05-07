import {
  LOTTERY_ERROR__BONUSBALL_OUT_OF_RANGE,
  LOTTERY_ERROR__DRAW_TIME_NOT_REACHED,
  LOTTERY_ERROR__EMERGENCY_MODE,
  LOTTERY_ERROR__GUARANTEE_EXCEEDS_CAP,
  LOTTERY_ERROR__INVALID_BATCH_SIZE,
  LOTTERY_ERROR__INVALID_BONUSBALL_RANGE,
  LOTTERY_ERROR__INVALID_CONFIG,
  LOTTERY_ERROR__INVALID_PICK_COUNTER,
  LOTTERY_ERROR__INVALID_PREMIUM_ALLOCATION,
  LOTTERY_ERROR__INVALID_RANDOMNESS_ACCOUNT,
  LOTTERY_ERROR__INVALID_ROUND_DURATION,
  LOTTERY_ERROR__INVALID_SUBSCRIPTION,
  LOTTERY_ERROR__INVALID_TICKET_NUMBERS,
  LOTTERY_ERROR__INVALID_TICKET_PRICE,
  LOTTERY_ERROR__INVALID_TIER_WEIGHT_BPS,
  LOTTERY_ERROR__INVALID_TOKEN_MINT,
  LOTTERY_ERROR__LP_CAP_EXCEEDED,
  LOTTERY_ERROR__LP_GUARANTEE_UNAVAILABLE,
  LOTTERY_ERROR__LP_INSUFFICIENT_SHARES,
  LOTTERY_ERROR__LP_NO_PENDING_WITHDRAWAL,
  LOTTERY_ERROR__LP_PRINCIPAL_UNDERFUNDED,
  LOTTERY_ERROR__LP_WITHDRAWAL_NOT_READY,
  LOTTERY_ERROR__LP_WITHDRAWAL_PENDING,
  LOTTERY_ERROR__MATH_OVERFLOW,
  LOTTERY_ERROR__NO_OPEN_ROUND,
  LOTTERY_ERROR__NO_REFERRAL_FEES,
  LOTTERY_ERROR__NORMAL_BALL_OUT_OF_RANGE,
  LOTTERY_ERROR__NOT_A_WINNING_TIER,
  LOTTERY_ERROR__NO_TIER_WINNERS,
  LOTTERY_ERROR__NOT_IN_EMERGENCY_MODE,
  LOTTERY_ERROR__NO_WINNING_TICKETS,
  LOTTERY_ERROR__PARENT_REFERRER_MISMATCH,
  LOTTERY_ERROR__PAUSED,
  LOTTERY_ERROR__PREVIOUS_ROUND_UNSETTLED,
  LOTTERY_ERROR__PRIZE_POOL_BELOW_FLOOR,
  LOTTERY_ERROR__PRIZE_VAULT_UNDERFUNDED,
  LOTTERY_ERROR__RANDOMNESS_ALREADY_REVEALED,
  LOTTERY_ERROR__RANDOMNESS_COMMIT_STILL_ACTIVE,
  LOTTERY_ERROR__RANDOMNESS_DERIVATION_FAILED,
  LOTTERY_ERROR__RANDOMNESS_EXPIRED,
  LOTTERY_ERROR__RANDOMNESS_NOT_RESOLVED,
  LOTTERY_ERROR__REFERRAL_REQUIRED,
  LOTTERY_ERROR__ROUND_ID_MISMATCH,
  LOTTERY_ERROR__ROUND_NOT_ARCHIVABLE,
  LOTTERY_ERROR__ROUND_NOT_CLAIMABLE,
  LOTTERY_ERROR__ROUND_NOT_DRAWING,
  LOTTERY_ERROR__ROUND_NOT_EMERGENCY,
  LOTTERY_ERROR__ROUND_NOT_OPEN,
  LOTTERY_ERROR__SELF_PARENT_REFERRER,
  LOTTERY_ERROR__SELF_REFERRAL,
  LOTTERY_ERROR__SUBSCRIPTION_ALREADY_PROCESSED,
  LOTTERY_ERROR__SUBSCRIPTION_INACTIVE,
  LOTTERY_ERROR__SUBSCRIPTION_PRICE_CHANGED,
  LOTTERY_ERROR__TICKET_ALREADY_CLAIMED,
  LOTTERY_ERROR__UNAUTHORIZED,
  type LotteryError,
} from "../../generated/lottery";

const FRIENDLY: Record<LotteryError, string> = {
  [LOTTERY_ERROR__UNAUTHORIZED]:
    "Only the configured admin wallet can perform this action.",
  [LOTTERY_ERROR__PAUSED]:
    "The protocol is currently paused. Try again once an admin resumes operations.",
  [LOTTERY_ERROR__EMERGENCY_MODE]:
    "Emergency mode is active. Most actions are frozen — only emergency refunds and emergency LP exits remain available.",
  [LOTTERY_ERROR__NOT_IN_EMERGENCY_MODE]:
    "Emergency mode is not active, so this emergency-only action cannot run.",
  [LOTTERY_ERROR__INVALID_CONFIG]:
    "One of the configuration parameters is out of range. Re-check the form values.",
  [LOTTERY_ERROR__INVALID_TIER_WEIGHT_BPS]:
    "Tier premium weights must sum to exactly 10,000 bps and non-winning tiers must have zero weight.",
  [LOTTERY_ERROR__PRIZE_POOL_BELOW_FLOOR]:
    "The combined LP edge and referral fees would push the prize pool below the protocol floor (50%). Lower one or more fees.",
  [LOTTERY_ERROR__INVALID_PREMIUM_ALLOCATION]:
    "Premium minimum allocation BPS must be between 0 and 10,000.",
  [LOTTERY_ERROR__INVALID_ROUND_DURATION]:
    "Round duration must be between 60 seconds and 7 days.",
  [LOTTERY_ERROR__INVALID_BONUSBALL_RANGE]:
    "Bonusball max must be between 5 and 64.",
  [LOTTERY_ERROR__INVALID_TICKET_PRICE]:
    "Ticket price must be a positive amount.",
  [LOTTERY_ERROR__GUARANTEE_EXCEEDS_CAP]:
    "The requested guaranteed prize pool exceeds the LP NAV cap. Either lower the guarantee or have an admin raise max_guarantee_per_round_bps.",
  [LOTTERY_ERROR__ROUND_NOT_OPEN]:
    "This round is not accepting tickets — it has already moved past the Open phase.",
  [LOTTERY_ERROR__DRAW_TIME_NOT_REACHED]:
    "The round's draw time has not yet been reached. Wait for the timer to elapse before committing the draw.",
  [LOTTERY_ERROR__ROUND_NOT_DRAWING]:
    "The round is not in the Drawing phase, so it cannot be revealed.",
  [LOTTERY_ERROR__ROUND_NOT_CLAIMABLE]:
    "Winnings can only be claimed once the round is in the Claimable or Archived state.",
  [LOTTERY_ERROR__ROUND_NOT_ARCHIVABLE]:
    "The round is not yet ready to be archived. Archiving is only valid for rounds currently in the Claimable state.",
  [LOTTERY_ERROR__PREVIOUS_ROUND_UNSETTLED]:
    "The previous round must be archived before a new one can start.",
  [LOTTERY_ERROR__ROUND_ID_MISMATCH]:
    "The supplied round account does not match the expected round id.",
  [LOTTERY_ERROR__NO_OPEN_ROUND]:
    "No open round is available right now. An admin must start a new round before tickets can be purchased.",
  [LOTTERY_ERROR__INVALID_TICKET_NUMBERS]:
    "Ticket numbers must be sorted ascending and contain no duplicates.",
  [LOTTERY_ERROR__NORMAL_BALL_OUT_OF_RANGE]:
    "One of the normal balls is outside the allowed range.",
  [LOTTERY_ERROR__BONUSBALL_OUT_OF_RANGE]:
    "The bonusball is outside the allowed range for this round.",
  [LOTTERY_ERROR__INVALID_BATCH_SIZE]:
    "Ticket batch size must be between 1 and 30.",
  [LOTTERY_ERROR__TICKET_ALREADY_CLAIMED]:
    "This ticket's winnings have already been claimed.",
  [LOTTERY_ERROR__NOT_A_WINNING_TIER]:
    "This ticket does not match a winning tier for the round.",
  [LOTTERY_ERROR__NO_TIER_WINNERS]:
    "No winners exist for this tier — there is nothing to claim.",
  [LOTTERY_ERROR__NO_WINNING_TICKETS]:
    "No winning tickets were supplied to this action.",
  [LOTTERY_ERROR__INVALID_RANDOMNESS_ACCOUNT]:
    "The supplied Switchboard randomness account does not match the round's commitment.",
  [LOTTERY_ERROR__RANDOMNESS_ALREADY_REVEALED]:
    "This Switchboard randomness account has already been revealed and cannot be reused.",
  [LOTTERY_ERROR__RANDOMNESS_NOT_RESOLVED]:
    "Switchboard randomness has not yet been revealed in the same transaction. Make sure the reveal instruction precedes reveal_draw.",
  [LOTTERY_ERROR__RANDOMNESS_EXPIRED]:
    "The Switchboard randomness commitment is stale. Restart the draw flow with a fresh randomness account.",
  [LOTTERY_ERROR__RANDOMNESS_DERIVATION_FAILED]:
    "Failed to derive winning numbers from the supplied randomness. Try again with a fresh randomness account.",
  [LOTTERY_ERROR__RANDOMNESS_COMMIT_STILL_ACTIVE]:
    "An active randomness commitment has not yet timed out. Wait for the configured draw_timeout_slots before re-committing.",
  [LOTTERY_ERROR__LP_CAP_EXCEEDED]:
    "This deposit would push the LP pool above the configured cap.",
  [LOTTERY_ERROR__LP_INSUFFICIENT_SHARES]:
    "Your LP position does not have enough shares for this withdrawal.",
  [LOTTERY_ERROR__LP_WITHDRAWAL_PENDING]:
    "You already have an LP withdrawal in progress. Finalize or wait for the cooldown before initiating another.",
  [LOTTERY_ERROR__LP_WITHDRAWAL_NOT_READY]:
    "Your LP withdrawal is not yet finalizable — the round you initiated in must finish before you can claim the assets.",
  [LOTTERY_ERROR__LP_NO_PENDING_WITHDRAWAL]:
    "No pending LP withdrawal exists. Initiate one before finalizing.",
  [LOTTERY_ERROR__PRIZE_VAULT_UNDERFUNDED]:
    "The prize vault is short of the amount this payout requires. Notify an operator if this persists.",
  [LOTTERY_ERROR__LP_PRINCIPAL_UNDERFUNDED]:
    "LP principal does not have enough liquidity to cover this payout shortfall.",
  [LOTTERY_ERROR__LP_GUARANTEE_UNAVAILABLE]:
    "Available LP liquidity is below the round's guaranteed prize pool. Lower the guarantee or wait for fresh deposits.",
  [LOTTERY_ERROR__NO_REFERRAL_FEES]:
    "You have no referral fees accrued to claim.",
  [LOTTERY_ERROR__SELF_REFERRAL]:
    "You cannot use your own wallet as the referrer.",
  [LOTTERY_ERROR__REFERRAL_REQUIRED]:
    "A referral account is required for this action but was not supplied.",
  [LOTTERY_ERROR__SELF_PARENT_REFERRER]:
    "A referrer cannot list themselves as their own parent referrer.",
  [LOTTERY_ERROR__PARENT_REFERRER_MISMATCH]:
    "The supplied parent referrer account does not match the referrer's stored parent.",
  [LOTTERY_ERROR__SUBSCRIPTION_INACTIVE]:
    "The subscription is inactive, expired, or has insufficient escrow to fund another round.",
  [LOTTERY_ERROR__SUBSCRIPTION_PRICE_CHANGED]:
    "The round ticket price changed since the subscription was created. The subscription has been deactivated.",
  [LOTTERY_ERROR__SUBSCRIPTION_ALREADY_PROCESSED]:
    "This subscription has already been processed for this round.",
  [LOTTERY_ERROR__INVALID_SUBSCRIPTION]:
    "Subscription parameters are out of range. Daily count must be 1–20 and days must be 1–365.",
  [LOTTERY_ERROR__MATH_OVERFLOW]:
    "An arithmetic overflow occurred. Try smaller values.",
  [LOTTERY_ERROR__INVALID_TOKEN_MINT]:
    "The supplied token mint does not match the lottery's payment mint.",
  [LOTTERY_ERROR__ROUND_NOT_EMERGENCY]:
    "This action requires the round to be in the Emergency state.",
  [LOTTERY_ERROR__INVALID_PICK_COUNTER]:
    "The pick counter PDA does not match the ticket's pick. The ticket's combo may belong to a different round.",
};

export function getFriendlyLotteryErrorMessage(code: LotteryError): string {
  return FRIENDLY[code];
}
