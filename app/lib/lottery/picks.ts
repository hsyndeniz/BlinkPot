"use client";

import type { Round } from "../../generated/lottery/accounts/round";
import type { Ticket } from "../../generated/lottery/accounts/ticket";

// ─── constants ─────────────────────────────────────────────────────────────

export const TIER_COUNT = 12;
export const NORMAL_BALL_COUNT = 5;

// ─── tier identification ───────────────────────────────────────────────────
// Mirrors `tier_for_match` in `anchor/programs/lottery/src/math.rs`:
// tier id = matches * 2 + (1 if has_bonus else 0).

export type TierLabel = { matches: number; hasBonus: boolean };

const TIER_LABELS: ReadonlyArray<TierLabel> = [
  { matches: 0, hasBonus: false },
  { matches: 0, hasBonus: true },
  { matches: 1, hasBonus: false },
  { matches: 1, hasBonus: true },
  { matches: 2, hasBonus: false },
  { matches: 2, hasBonus: true },
  { matches: 3, hasBonus: false },
  { matches: 3, hasBonus: true },
  { matches: 4, hasBonus: false },
  { matches: 4, hasBonus: true },
  { matches: 5, hasBonus: false },
  { matches: 5, hasBonus: true },
];

export function tierLabel(tier: number): TierLabel {
  return TIER_LABELS[tier] ?? { matches: 0, hasBonus: false };
}

export function tierForMatch(matches: number, hasBonus: boolean): number {
  return matches * 2 + (hasBonus ? 1 : 0);
}

// ─── tier combinatorics ────────────────────────────────────────────────────
// TS port of `tier_combos_table` in `math.rs`. Used by the UI to render the
// tier table column "combos" and to estimate prize-pool dilution per tier.

function binomial(n: number, k: number): bigint {
  if (k < 0 || k > n) return 0n;
  const kk = Math.min(k, n - k);
  let result = 1n;
  for (let i = 0; i < kk; i += 1) {
    result = (result * BigInt(n - i)) / BigInt(i + 1);
  }
  return result;
}

function normalMatchCombos(matches: number, normalMax: number): bigint {
  const total = BigInt(normalMax);
  const winning = BigInt(NORMAL_BALL_COUNT);
  const losing = total - winning > 0n ? total - winning : 0n;
  return (
    binomial(Number(winning), matches) *
    binomial(Number(losing), Number(winning) - matches)
  );
}

export function tierCombos(
  matches: number,
  hasBonus: boolean,
  normalMax: number,
  bonusMax: number
): bigint {
  const normalCombos = normalMatchCombos(matches, normalMax);
  const bonusFactor = hasBonus ? 1n : BigInt(Math.max(bonusMax - 1, 0));
  return normalCombos * bonusFactor;
}

export function tierCombosTable(
  normalMax: number,
  bonusMax: number
): bigint[] {
  const out: bigint[] = new Array(TIER_COUNT).fill(0n);
  for (let m = 0; m <= NORMAL_BALL_COUNT; m += 1) {
    out[tierForMatch(m, false)] = tierCombos(m, false, normalMax, bonusMax);
    out[tierForMatch(m, true)] = tierCombos(m, true, normalMax, bonusMax);
  }
  return out;
}

// ─── pick evaluation ───────────────────────────────────────────────────────
// Match a (normals, bonusball) pick against a round to determine its tier and
// whether it wins. Both lists are sorted ascending (program enforces this for
// tickets, `derive_winning_numbers` sorts winners) so we run a linear merge.

export type Match = {
  matches: number;
  hasBonusball: boolean;
};

export type Outcome = Match & {
  tier: number;
  /** True iff `round.tierIsWinning[tier]` is set. */
  winning: boolean;
};

export function countMatches(
  ticketNormals: ArrayLike<number>,
  ticketBonus: number,
  winningNormals: ArrayLike<number>,
  winningBonus: number
): Match {
  let matches = 0;
  let i = 0;
  let j = 0;
  while (i < ticketNormals.length && j < winningNormals.length) {
    const a = ticketNormals[i];
    const b = winningNormals[j];
    if (a === b) {
      matches += 1;
      i += 1;
      j += 1;
    } else if (a < b) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return { matches, hasBonusball: ticketBonus === winningBonus };
}

/** Convenience overload for whole-Ticket evaluation. */
export function countTicketMatches(round: Round, ticket: Ticket): Match {
  return countMatches(
    ticket.normals,
    ticket.bonusball,
    round.winningNormals,
    round.winningBonusball
  );
}

/**
 * Evaluate an arbitrary pick against a round and return the full outcome
 * (tier id, winning flag). Used by ticket rows AND by lookup tools that don't
 * have a Ticket account but still want to know whether a hypothetical pick
 * would win.
 */
export function evaluatePick(
  round: Round,
  normals: ArrayLike<number>,
  bonusball: number
): Outcome {
  const m = countMatches(
    normals,
    bonusball,
    round.winningNormals,
    round.winningBonusball
  );
  const tier = tierForMatch(m.matches, m.hasBonusball);
  return {
    ...m,
    tier,
    winning: round.tierIsWinning?.[tier] === true,
  };
}

export function isWinningTicket(round: Round, ticket: Ticket): Outcome {
  return evaluatePick(round, ticket.normals, ticket.bonusball);
}
