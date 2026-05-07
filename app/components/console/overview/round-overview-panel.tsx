"use client";

import { useCurrentRound } from "../../../lib/lottery/accounts";
import { useConfig } from "../../../lib/lottery/accounts";
import { useMint, useTokenSymbol } from "../../../lib/lottery/tokens";
import {
  Countdown,
  EmptyState,
  Metric,
  MetricGrid,
  Panel,
  RoundStateBadge,
  StatusBadge,
  TokenAmount,
} from "../shared";
import { WinningNumbersBalls } from "./winning-numbers-balls";

export function RoundOverviewPanel() {
  const { config } = useConfig();
  const { decimals } = useMint(config?.paymentMint);
  const symbol = useTokenSymbol(config?.paymentMint);
  const { round, address } = useCurrentRound();

  if (!round)
    return (
      <Panel title="Round overview">
        <EmptyState
          title="No active round"
          description="Start a round from the Operations tab when ready."
        />
      </Panel>
    );

  void address;
  const claimedFraction =
    round.ticketCount > 0n
      ? `${round.claimedCount.toString()} / ${round.ticketCount.toString()}`
      : "0 / 0";

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          Round #{round.roundId.toString()}
          <RoundStateBadge state={round.state} />
        </span>
      }
      description={
        <span className="flex items-center gap-2 text-xs">
          {round.usedMinimumPayouts && (
            <StatusBadge tone="info">Min payouts applied</StatusBadge>
          )}
        </span>
      }
    >
      <MetricGrid columns={3}>
        <Metric
          label="Prize pool"
          value={
            <TokenAmount
              amount={round.prizePool}
              decimals={decimals}
              mint={config?.paymentMint}
              showSymbol={false}
            />
          }
          subvalue={symbol}
        />
        <Metric
          label="Ticket price"
          value={
            <TokenAmount
              amount={round.ticketPrice}
              decimals={decimals}
              mint={config?.paymentMint}
              showSymbol={false}
            />
          }
          subvalue={symbol}
        />
        <Metric
          label="Tickets bought"
          value={round.ticketCount.toString()}
          subvalue={`Claimed: ${claimedFraction}`}
        />
        <Metric
          label="Draw time"
          value={<Countdown targetUnixSeconds={round.drawTime} />}
          subvalue={
            round.drawTime
              ? new Date(Number(round.drawTime) * 1000).toLocaleString()
              : "-"
          }
        />
        <Metric
          label="Ball ranges"
          value={`1..${round.normalBallMax} · 1..${round.bonusballMax}`}
          subvalue="normals · bonus"
        />
        <Metric
          label="LP guarantee"
          value={
            <TokenAmount
              amount={round.lpGuaranteeReserved}
              decimals={decimals}
              mint={config?.paymentMint}
              showSymbol={false}
            />
          }
          subvalue={symbol}
        />
      </MetricGrid>
      <div className="mt-4">
        <WinningNumbersBalls round={round} />
      </div>
    </Panel>
  );
}
