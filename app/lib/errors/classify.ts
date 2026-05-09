export type ErrorAlertStatus = "danger" | "warning" | "accent" | "success";

export type ErrorClassification = {
  status: ErrorAlertStatus;
  title: string;
};

/**
 * Map a friendly transaction-error message (produced by `parseTransactionError`)
 * to an Alert title + severity. Patterns are checked in order — the first match
 * wins, so put more specific patterns above broader ones.
 */
const PATTERNS: ReadonlyArray<readonly [RegExp, ErrorClassification]> = [
  [
    /rejected by the wallet|user rejected/i,
    { status: "warning", title: "Wallet rejected" },
  ],
  [
    /not accepting tickets|no open round|round.*closed|drawing|draw time has not yet/i,
    { status: "warning", title: "Round unavailable" },
  ],
  [
    /subscription/i,
    { status: "danger", title: "Subscription failed" },
  ],
  [
    /referral|referrer/i,
    { status: "danger", title: "Referral error" },
  ],
  [
    /insufficient|not enough|underfunded/i,
    { status: "warning", title: "Insufficient balance" },
  ],
  [
    /paused|emergency mode/i,
    { status: "warning", title: "Protocol unavailable" },
  ],
  [
    /randomness|switchboard/i,
    { status: "danger", title: "Draw randomness error" },
  ],
  [
    /pick|ticket numbers|ball.*range/i,
    { status: "danger", title: "Invalid ticket numbers" },
  ],
];

const FALLBACK: ErrorClassification = {
  status: "danger",
  title: "Transaction failed",
};

export function classifyError(
  message: string | null | undefined
): ErrorClassification {
  if (!message) return FALLBACK;
  for (const [pattern, category] of PATTERNS) {
    if (pattern.test(message)) return category;
  }
  return FALLBACK;
}
