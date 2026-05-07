"use client";

import { tierLabel } from "../../../lib/lottery/picks";

export function TierLabel(props: { tier: number; compact?: boolean }) {
  const { tier, compact = false } = props;
  const { matches, hasBonus } = tierLabel(tier);
  if (compact) {
    return (
      <span className="font-mono text-xs">
        {matches}N{hasBonus ? "+B" : ""}
      </span>
    );
  }
  return (
    <span>
      <span className="font-mono text-xs text-muted">#{tier}</span>{" "}
      <span className="text-xs">
        ({matches} normal{matches === 1 ? "" : "s"}
        {hasBonus ? " + bonus" : ""})
      </span>
    </span>
  );
}
