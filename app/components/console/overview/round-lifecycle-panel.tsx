"use client";

import { RoundState, type Round } from "../../../generated/lottery";
import { useRoundCounter } from "../../../lib/lottery/accounts";
import { AddressLink, Panel, RelativeTime, TokenAmount } from "../shared";
import type { Address } from "@solana/kit";

type Step = {
  label: string;
  unixSeconds?: bigint;
  state: "done" | "current" | "pending" | "skipped";
};

function buildTimeline(round: Round): Step[] {
  const isEmergency = round.state === RoundState.Emergency;
  const stateOrder = [
    RoundState.Open,
    RoundState.Drawing,
    RoundState.Claimable,
    RoundState.Archived,
  ];
  const currentIndex = stateOrder.indexOf(round.state);
  const status = (idx: number): Step["state"] =>
    isEmergency
      ? idx === 0
        ? "done"
        : "skipped"
      : currentIndex < 0
        ? "pending"
        : idx < currentIndex
          ? "done"
          : idx === currentIndex
            ? "current"
            : "pending";

  return [
    { label: "Opened", unixSeconds: round.openedAt, state: status(0) },
    {
      label: "Drawing",
      unixSeconds:
        round.commitSlot > 0n ? undefined : undefined,
      state: status(1),
    },
    { label: "Claimable", unixSeconds: round.settledAt, state: status(2) },
    { label: "Archived", unixSeconds: undefined, state: status(3) },
  ];
}

export function RoundLifecyclePanel(props: {
  round: Round | undefined;
  paymentMint?: Address;
  decimals: number;
}) {
  const { round, paymentMint, decimals } = props;
  const { counter } = useRoundCounter();

  if (!round) return null;
  const steps = buildTimeline(round);

  return (
    <Panel
      title="Round lifecycle"
      description={
        counter
          ? `Current: #${counter.currentRoundId.toString()} · Last settled: #${counter.lastSettledRoundId.toString()}`
          : undefined
      }
    >
      <ol className="grid gap-2 text-sm">
        {steps.map((s) => (
          <li
            key={s.label}
            className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${
              s.state === "current"
                ? "border-blue-500/30 bg-blue-500/10"
                : s.state === "done"
                  ? "border-green-500/20 bg-green-500/5"
                  : s.state === "skipped"
                    ? "border-destructive/20 bg-destructive/5 text-destructive"
                    : "border-border-low text-muted"
            }`}
          >
            <span className="text-xs font-semibold">{s.label}</span>
            <span className="text-xs">
              {s.unixSeconds ? (
                <RelativeTime unixSeconds={s.unixSeconds} />
              ) : s.state === "done" ? (
                <span className="text-muted">complete</span>
              ) : s.state === "current" ? (
                <span className="text-blue-700 dark:text-blue-300">
                  in progress
                </span>
              ) : s.state === "skipped" ? (
                <span>skipped (emergency)</span>
              ) : (
                <span className="text-muted">pending</span>
              )}
            </span>
          </li>
        ))}
        {round.state === RoundState.Emergency && (
          <li className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">Emergency entered</span>
              <RelativeTime unixSeconds={round.emergencyAt} />
            </div>
          </li>
        )}
        {round.state === RoundState.Drawing && round.commitSlot > 0n && (
          <li className="rounded-md border border-border-low px-3 py-2 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span>Commit slot</span>
              <span className="font-mono">{round.commitSlot.toString()}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <span>Randomness account</span>
              <AddressLink address={round.randomnessAccount} showCopy />
            </div>
          </li>
        )}
        {round.state === RoundState.Archived && (
          <li className="grid gap-1 rounded-md border border-border-low px-3 py-2 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span>Rolled to next round</span>
              <TokenAmount
                amount={round.rolledToNextRound}
                decimals={decimals}
                mint={paymentMint}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Rolled to LP</span>
              <TokenAmount
                amount={round.rolledToLp}
                decimals={decimals}
                mint={paymentMint}
              />
            </div>
          </li>
        )}
      </ol>
    </Panel>
  );
}
