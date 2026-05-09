"use client";

import { Card, Surface } from "@heroui/react";
import { Sparkles, ShieldCheck } from "@gravity-ui/icons";
import { useConfig } from "../../lib/lottery/accounts";

export function LpHeroCard() {
  const { config } = useConfig();
  const edgePct =
    config != null ? (config.lpEdgeBps / 100).toFixed(1) : "—";

  return (
    <Card className="w-full">
      <Card.Content className="grid gap-4">
        <div className="flex items-start gap-3">
          <Surface
            variant="secondary"
            className="flex size-10 shrink-0 items-center justify-center rounded-2xl text-warning"
          >
            <ShieldCheck className="size-5" />
          </Surface>
          <div className="grid gap-1">
            <h2 className="text-lg font-bold tracking-tight sm:text-xl">
              Underwrite jackpots, earn the edge
            </h2>
            <p className="text-sm text-muted">
              Deposit liquidity to back the prize pool. You share in the house
              edge of every round — and absorb a fraction of the loss when a
              jackpot pays out beyond ticket sales.
            </p>
          </div>
        </div>

        <Surface
          variant="secondary"
          className="grid gap-1 rounded-2xl p-4 text-center"
        >
          <span className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted">
            <Sparkles className="size-3" />
            LP edge
          </span>
          <span className="text-3xl font-black tabular-nums tracking-tight">
            {edgePct}
            <span className="ml-0.5 text-base font-semibold text-muted">%</span>
          </span>
          <span className="text-xs text-muted">
            of every ticket sale flows to the LP pool
          </span>
        </Surface>
      </Card.Content>
    </Card>
  );
}
