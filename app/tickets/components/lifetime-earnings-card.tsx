"use client";

import { Card, Chip, Surface } from "@heroui/react";
import { Cup } from "@gravity-ui/icons";
import { useConfig } from "../../lib/lottery/accounts";
import {
  formatTokenAmount,
  useMint,
  useTokenSymbol,
} from "../../lib/lottery/tokens";
import { useLifetimeEarnings } from "../_lifetime-context";

export function LifetimeEarningsCard() {
  const lifetime = useLifetimeEarnings();
  const { config } = useConfig();
  const { decimals } = useMint(config?.paymentMint);
  const symbol = useTokenSymbol(config?.paymentMint);

  if (!lifetime) return null;
  const { won, claimable, rounds } = lifetime.totals;

  const fmt = (v: bigint) =>
    `${formatTokenAmount(v, decimals, { maxDecimals: 2 })} ${symbol}`;

  return (
    <Card className="w-full">
      <Card.Content className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Surface
              variant="default"
              className="flex size-8 items-center justify-center rounded-full"
            >
              <Cup className="size-4 text-success" />
            </Surface>
            <div className="grid">
              <span className="text-sm font-semibold">Lifetime earnings</span>
              <span className="text-xs text-muted">
                Across {rounds} round{rounds === 1 ? "" : "s"} you played
              </span>
            </div>
          </div>
          {claimable > 0n && (
            <Chip size="sm" color="success" variant="primary">
              <Chip.Label>{fmt(claimable)} to claim</Chip.Label>
            </Chip>
          )}
        </div>

        <Surface
          variant="secondary"
          className="grid gap-1 rounded-2xl p-3 text-center"
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted">
            Total won
          </span>
          <p className="bg-gradient-to-br from-foreground via-foreground/85 to-foreground/50 bg-clip-text text-transparent text-3xl font-black tabular-nums tracking-tighter sm:text-4xl">
            {fmt(won)}
          </p>
        </Surface>

        <p className="text-xs text-muted">
          Aggregated from the past rounds loaded below — load older rounds to
          fold them into the total.
        </p>
      </Card.Content>
    </Card>
  );
}
