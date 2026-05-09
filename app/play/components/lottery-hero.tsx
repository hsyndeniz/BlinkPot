"use client";

import { Card, Chip, Skeleton } from "@heroui/react";
import { Circle, Clock, Sparkles, Ticket } from "@gravity-ui/icons";
import { RoundState } from "../../generated/lottery";
import { useConfig, useCurrentRound } from "../../lib/lottery/accounts";
import { useNowSeconds } from "../../lib/lottery/now";
import {
  formatTokenAmount,
  useMint,
  useTokenSymbol,
} from "../../lib/lottery/tokens";

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

function formatCountdown(remaining: number): string {
  if (remaining <= 0) return "drawing now";
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

export function LotteryHero() {
  const { config } = useConfig();
  const { decimals } = useMint(config?.paymentMint);
  const symbol = useTokenSymbol(config?.paymentMint);
  const { round } = useCurrentRound();
  const now = useNowSeconds();

  const prize = round
    ? formatTokenAmount(round.prizePool, decimals, { maxDecimals: 0 }).replace(
        /\B(?=(\d{3})+(?!\d))/g,
        ","
      )
    : "—";
  const remaining = round ? Number(round.drawTime) - now : null;
  const isDrawing = remaining != null && remaining <= 0;
  const countdown = remaining != null ? formatCountdown(remaining) : "—";
  const tickets = round?.ticketCount.toString() ?? "—";
  const roundId = round ? `#${round.roundId.toString()}` : "—";
  const stateLabel = round != null ? STATE_LABELS[round.state] : "Loading";
  const stateColor = round != null ? STATE_COLORS[round.state] : "default";

  if (!round) {
    return (
      <Card className="w-full max-w-lg">
        <Card.Content className="grid gap-3">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="grid gap-2 text-center">
            <Skeleton className="mx-auto h-3 w-32" />
            <Skeleton className="mx-auto h-14 w-48 sm:h-16" />
          </div>
          <div className="flex justify-center gap-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
          </div>
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-lg">
      <Card.Content className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <Chip color={stateColor} variant="primary" size="sm">
            <Circle className="size-1.5" />
            <Chip.Label>{stateLabel}</Chip.Label>
          </Chip>
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            Round {roundId}
          </span>
        </div>

        <div className="grid gap-1 text-center">
          <div className="flex items-center justify-center gap-1.5 text-warning">
            <Sparkles className="size-4" />
            <span className="text-sm font-semibold uppercase text-muted">
              {symbol} prize pool
            </span>
            <Sparkles className="size-4" />
          </div>
          <p className="bg-gradient-to-br from-foreground via-foreground/85 to-foreground/50 bg-clip-text text-transparent text-5xl font-black tabular-nums tracking-tighter sm:text-5xl">
            <span className="bg-gradient-to-br from-foreground via-foreground/85 to-foreground/50 bg-clip-text text-transparent text-5xl font-black tabular-nums tracking-tighter sm:text-5xl opacity-60">
              $
            </span>
            {prize}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
          <span className="flex items-center gap-1.5">
            <Clock className="size-3.5 text-muted" />
            {isDrawing ? (
              <span className="font-semibold">drawing now</span>
            ) : (
              <>
                <span className="font-semibold tabular-nums">{countdown}</span>
                <span className="text-muted">to draw</span>
              </>
            )}
          </span>
          <span className="hidden text-muted sm:inline">·</span>
          <span className="flex items-center gap-1.5">
            <Ticket className="size-3.5 text-muted" />
            <span className="font-semibold tabular-nums">{tickets}</span>
            <span className="text-muted">sold</span>
          </span>
        </div>
      </Card.Content>
    </Card>
  );
}
