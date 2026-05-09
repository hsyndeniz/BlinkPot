"use client";

import { useEffect, useState } from "react";
import { Button, Card, Chip } from "@heroui/react";
import { ArrowRight, Cup } from "@gravity-ui/icons";
import type { Account, Address } from "@solana/kit";
import { RoundState, type Round } from "../../generated/lottery";
import { useConfig, useTickets } from "../../lib/lottery/accounts";
import {
  formatTokenAmount,
  useMint,
  useTokenSymbol,
} from "../../lib/lottery/tokens";
import { useLifetimeEarnings } from "../_lifetime-context";
import { PastRoundTicketsModal } from "./past-round-tickets-modal";

const STATE_LABELS: Record<RoundState, string> = {
  [RoundState.Open]: "Open",
  [RoundState.Drawing]: "Drawing",
  [RoundState.Claimable]: "Claimable",
  [RoundState.Archived]: "Archived",
  [RoundState.Emergency]: "Emergency",
};

const STATE_COLORS: Record<
  RoundState,
  "success" | "warning" | "danger" | "default"
> = {
  [RoundState.Open]: "success",
  [RoundState.Drawing]: "warning",
  [RoundState.Claimable]: "success",
  [RoundState.Archived]: "default",
  [RoundState.Emergency]: "danger",
};

function NumberBall(props: { value: number; isBonus?: boolean }) {
  const gradient = props.isBonus
    ? "bg-gradient-to-b from-foreground/80 to-foreground text-background"
    : "bg-gradient-to-b from-zinc-100 to-zinc-300 text-zinc-900 dark:from-zinc-700 dark:to-zinc-900 dark:text-zinc-50";
  return (
    <span
      className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${gradient}`}
    >
      {props.value}
    </span>
  );
}

export function PastRoundCard(props: {
  round: Account<Round>;
  walletAddress: Address;
}) {
  const { round, walletAddress } = props;
  const roundData = round.data;
  const [open, setOpen] = useState(false);

  const { config } = useConfig();
  const { decimals } = useMint(config?.paymentMint);
  const symbol = useTokenSymbol(config?.paymentMint);

  const { tickets, isLoading } = useTickets(roundData.roundId, walletAddress);
  const lifetime = useLifetimeEarnings();

  const isSettled =
    roundData.state === RoundState.Claimable ||
    roundData.state === RoundState.Archived;

  let winningCount = 0;
  let unclaimedWinners = 0;
  let totalClaimable = 0n;
  let totalWon = 0n;
  if (isSettled) {
    for (const t of tickets) {
      let matches = 0;
      let i = 0;
      let j = 0;
      while (
        i < t.data.normals.length &&
        j < roundData.winningNormals.length
      ) {
        const a = t.data.normals[i];
        const b = roundData.winningNormals[j];
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
      const tier =
        matches * 2 +
        (t.data.bonusball === roundData.winningBonusball ? 1 : 0);
      const isWinning = roundData.tierIsWinning?.[tier] === true;
      if (!isWinning) continue;
      winningCount += 1;
      const perCombo = roundData.perComboPayout?.[tier] ?? 0n;
      totalWon += perCombo;
      if (perCombo > 0n && !t.data.claimed) {
        unclaimedWinners += 1;
        totalClaimable += perCombo;
      }
    }
  }

  // Push this round's totals into the page-level lifetime aggregator. Only
  // active when wrapped by `LifetimeEarningsProvider`. Must run before any
  // early returns to keep the hook order stable.
  const roundIdStr = roundData.roundId.toString();
  useEffect(() => {
    if (!lifetime || isLoading) return;
    lifetime.register(roundIdStr, {
      won: totalWon,
      claimable: totalClaimable,
    });
  }, [lifetime, roundIdStr, isLoading, totalWon, totalClaimable]);

  // Don't bother rendering rounds the user didn't play.
  if (!isLoading && tickets.length === 0) return null;

  const claimableLabel =
    totalClaimable > 0n
      ? `${formatTokenAmount(totalClaimable, decimals, { maxDecimals: 2 })} ${symbol}`
      : null;

  return (
    <>
      <Card
        variant={unclaimedWinners > 0 ? "secondary" : "default"}
        className="grid gap-3 p-3"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">
              Round #{roundData.roundId.toString()}
            </span>
            <Chip
              size="sm"
              color={STATE_COLORS[roundData.state]}
              variant="primary"
            >
              <Chip.Label>{STATE_LABELS[roundData.state]}</Chip.Label>
            </Chip>
          </div>
          <span className="text-xs text-muted">
            {tickets.length} ticket{tickets.length === 1 ? "" : "s"}
          </span>
        </div>

        {isSettled && roundData.winningNormals.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-default-100 p-2 dark:bg-default-100">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-muted">
              Winning
            </span>
            {Array.from(roundData.winningNormals).map((n, i) => (
              <NumberBall key={i} value={n} />
            ))}
            <span className="px-0.5 text-muted">+</span>
            <NumberBall value={roundData.winningBonusball} isBonus />
          </div>
        )}

        {winningCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Cup className="size-3 text-success" />
            <span className="font-semibold text-success">
              {winningCount} winner{winningCount === 1 ? "" : "s"}
            </span>
            {unclaimedWinners > 0 && claimableLabel && (
              <Chip size="sm" color="success" variant="primary">
                <Chip.Label>
                  {claimableLabel} to claim ·{" "}
                  {unclaimedWinners} ticket
                  {unclaimedWinners === 1 ? "" : "s"}
                </Chip.Label>
              </Chip>
            )}
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          fullWidth
          onPress={() => setOpen(true)}
        >
          View all tickets
          <ArrowRight />
        </Button>
      </Card>

      <PastRoundTicketsModal
        isOpen={open}
        onClose={() => setOpen(false)}
        round={round}
        walletAddress={walletAddress}
      />
    </>
  );
}
