"use client";

import { useMemo, useState } from "react";
import { useRoundCounter, useRounds } from "../../../lib/lottery/accounts";
import { useConfig } from "../../../lib/lottery/accounts";
import { useMint } from "../../../lib/lottery/tokens";
import { useConsole } from "../../../lib/console/console-context";
import {
  ActionButton,
  EmptyState,
  Panel,
  RelativeTime,
  RoundStateBadge,
  Skeleton,
  TokenAmount,
} from "../shared";

const PAGE_SIZE = 10;

export function RoundsHistoryList() {
  const { config } = useConfig();
  const { decimals } = useMint(config?.paymentMint);
  const counter = useRoundCounter();
  const { setSelectedRoundId } = useConsole();

  const [page, setPage] = useState(0);

  const range = useMemo(() => {
    const current = counter.counter?.currentRoundId ?? 0n;
    if (current === 0n) return { from: 0n, to: 0n };
    const top = current - BigInt(page * PAGE_SIZE);
    const top1 = top > 0n ? top : 1n;
    const bottom =
      top1 > BigInt(PAGE_SIZE - 1) ? top1 - BigInt(PAGE_SIZE - 1) : 1n;
    return { from: bottom, to: top1 };
  }, [counter.counter?.currentRoundId, page]);

  const rounds = useRounds(range);
  const current = counter.counter?.currentRoundId ?? 0n;
  const hasNext =
    current > 0n &&
    BigInt((page + 1) * PAGE_SIZE) < current;

  return (
    <Panel
      title="Rounds history"
      description={`Showing #${range.to.toString()} → #${range.from.toString()}`}
    >
      {rounds.isLoading ? (
        <Skeleton rows={4} />
      ) : rounds.rounds.length === 0 ? (
        <EmptyState description="No rounds yet." />
      ) : (
        <div className="grid gap-2 text-sm">
          {rounds.rounds.map((r) => {
            const data = r.data;
            return (
              <button
                key={data.roundId.toString()}
                type="button"
                onClick={() => setSelectedRoundId(data.roundId)}
                className="flex items-center justify-between gap-3 rounded-md border border-border-low bg-background/40 px-3 py-2 text-left transition hover:bg-cream"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs">
                    #{data.roundId.toString()}
                  </span>
                  <RoundStateBadge state={data.state} />
                </div>
                <div className="flex items-center gap-4 text-xs text-muted">
                  <span>
                    Pool:{" "}
                    <TokenAmount
                      amount={data.prizePool}
                      decimals={decimals}
                      mint={config?.paymentMint}
                      showSymbol={false}
                    />
                  </span>
                  <span>Tickets: {data.ticketCount.toString()}</span>
                  <span>
                    Drew{" "}
                    <RelativeTime
                      unixSeconds={data.settledAt}
                      fallback="—"
                      showAbsolute={false}
                    />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <ActionButton
          variant="secondary"
          size="sm"
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          ← Newer
        </ActionButton>
        <ActionButton
          variant="secondary"
          size="sm"
          disabled={!hasNext}
          onClick={() => setPage((p) => p + 1)}
        >
          Older →
        </ActionButton>
      </div>
    </Panel>
  );
}
