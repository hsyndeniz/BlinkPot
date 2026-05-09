import {
  isSolanaError,
  SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM,
} from "@solana/kit";
import {
  getLotteryErrorMessage,
  type LotteryError,
} from "../generated/lottery";
import {
  getVaultErrorMessage,
  VAULT_ERROR__VAULT_ALREADY_EXISTS,
  VAULT_ERROR__INVALID_AMOUNT,
  type VaultError,
} from "../generated/vault";
import { getFriendlyLotteryErrorMessage } from "./errors/error-messages";

const LOTTERY_ERROR_MIN = 0x1770;
const LOTTERY_ERROR_MAX = 0x17a8;
const MAX_ERROR_LENGTH = 200;

const VAULT_ERROR_CODES: Record<number, VaultError> = {
  [VAULT_ERROR__VAULT_ALREADY_EXISTS]: VAULT_ERROR__VAULT_ALREADY_EXISTS,
  [VAULT_ERROR__INVALID_AMOUNT]: VAULT_ERROR__INVALID_AMOUNT,
};

function isCustomProgramError(
  err: unknown
): err is ReturnType<typeof isSolanaError> extends infer R
  ? R extends true
    ? Error & { context: { code: number } }
    : never
  : never {
  return (
    isSolanaError(err, SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM) &&
    typeof err.context?.code === "number"
  );
}

function lotteryErrorMessage(code: number): string | null {
  if (code < LOTTERY_ERROR_MIN || code > LOTTERY_ERROR_MAX) return null;
  const typed = code as LotteryError;
  return getFriendlyLotteryErrorMessage(typed) ?? getLotteryErrorMessage(typed);
}

function vaultErrorMessage(code: number): string | null {
  const variant = VAULT_ERROR_CODES[code];
  return variant != null ? getVaultErrorMessage(variant) : null;
}

/** Walk an Error's cause chain to find the deepest message. */
function getDeepestMessage(err: unknown): string {
  let deepest = err instanceof Error ? err.message : String(err);
  let current: unknown = err;
  while (current instanceof Error && current.cause) {
    current = current.cause;
    if (current instanceof Error) deepest = current.message;
  }
  return deepest;
}

function truncate(s: string): string {
  return s.length > MAX_ERROR_LENGTH ? `${s.slice(0, MAX_ERROR_LENGTH)}...` : s;
}

/**
 * Extract a custom program error code from an arbitrary error message.
 * RPC preflight failures, AnchorError logs, and various wallet wrappers
 * surface the code as a stringified number/hex rather than as a typed
 * SolanaError, so we recover it from the raw text.
 */
function extractProgramErrorCode(message: string): number | null {
  // "custom program error: 0x177d" — final hex form.
  const hex = message.match(/custom program error:?\s*0x([0-9a-f]+)/i);
  if (hex) return Number.parseInt(hex[1], 16);
  // "Custom program error: #6013" — preflight summary.
  const dec = message.match(/custom program error:?\s*#?(\d+)/i);
  if (dec) return Number.parseInt(dec[1], 10);
  // "Error Number: 6013" — AnchorError log line.
  const anchor = message.match(/Error Number:\s*(\d+)/);
  if (anchor) return Number.parseInt(anchor[1], 10);
  return null;
}

export function parseTransactionError(err: unknown): string {
  if (err instanceof Error && err.message.includes("User rejected")) {
    return "Transaction was rejected by the wallet.";
  }
  if (isCustomProgramError(err)) {
    const code = err.context.code;
    return (
      lotteryErrorMessage(code) ??
      vaultErrorMessage(code) ??
      truncate(getDeepestMessage(err))
    );
  }

  const message = getDeepestMessage(err);
  const extracted = extractProgramErrorCode(message);
  if (extracted != null) {
    const friendly = lotteryErrorMessage(extracted) ?? vaultErrorMessage(extracted);
    if (friendly) return friendly;
  }
  return truncate(message);
}
