"use client";

import { Card, Surface } from "@heroui/react";
import { ChartBar, CircleDollar, ShieldCheck } from "@gravity-ui/icons";
import { useConfig, useLpVault } from "../../lib/lottery/accounts";
import {
  formatTokenAmount,
  useMint,
  useTokenSymbol,
} from "../../lib/lottery/tokens";
import { assetsForShares } from "../_lp-math";

function Stat(props: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="grid gap-1">
      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        {props.icon}
        {props.label}
      </span>
      <span className="text-base font-semibold tabular-nums">
        {props.value}
      </span>
      {props.hint && (
        <span className="text-[11px] text-muted">{props.hint}</span>
      )}
    </div>
  );
}

export function LpVaultStatsCard() {
  const { config } = useConfig();
  const { decimals } = useMint(config?.paymentMint);
  const symbol = useTokenSymbol(config?.paymentMint);
  const { lpVault } = useLpVault();

  const fmt = (v: bigint) =>
    `${formatTokenAmount(v, decimals, { maxDecimals: 2 })} ${symbol}`;

  const totalAssets = lpVault?.totalAssets ?? 0n;
  const totalShares = lpVault?.totalShares ?? 0n;
  const lifetimeEdge = lpVault?.lifetimeEdgeEarned ?? 0n;
  const lifetimeLoss = lpVault?.lifetimeJackpotLoss ?? 0n;

  // 1 share is worth N base units; we render in tokens so divide by share-scale.
  // assetsForShares(1e6 shares, totalShares, totalAssets) gives the price of
  // INITIAL_SHARES_PER_TOKEN_UNIT shares — i.e. one whole token's worth of LP.
  const sharePrice = assetsForShares(1_000_000n, totalShares, totalAssets);

  return (
    <Card className="w-full">
      <Card.Content className="grid gap-3">
        <div className="flex items-center gap-2">
          <ChartBar className="size-4 text-muted" />
          <span className="text-sm font-semibold">Vault stats</span>
        </div>

        <Surface
          variant="secondary"
          className="grid gap-1 rounded-2xl p-4 text-center"
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted">
            Vault NAV
          </span>
          <p className="bg-gradient-to-br from-foreground via-foreground/85 to-foreground/50 bg-clip-text text-transparent text-3xl font-black tabular-nums tracking-tighter sm:text-4xl">
            {fmt(totalAssets)}
          </p>
        </Surface>

        <Surface
          variant="default"
          className="grid grid-cols-3 gap-3 rounded-2xl p-3"
        >
          <Stat
            icon={<ChartBar className="size-3" />}
            label="Shares"
            value={totalShares.toString()}
          />
          <Stat
            icon={<CircleDollar className="size-3" />}
            label="1 token"
            value={
              totalShares === 0n
                ? "—"
                : `${formatTokenAmount(sharePrice, decimals, { maxDecimals: 4 })} ${symbol}`
            }
            hint="per LP token"
          />
          <Stat
            icon={<ShieldCheck className="size-3" />}
            label="Pool cap"
            value={
              !config
                ? "—"
                : config.lpPoolCap === 0n
                  ? "Uncapped"
                  : fmt(config.lpPoolCap)
            }
          />
        </Surface>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted">Lifetime edge earned</span>
            <span className="font-semibold text-success">
              {fmt(lifetimeEdge)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Lifetime jackpot loss</span>
            <span className="font-semibold text-foreground">
              {fmt(lifetimeLoss)}
            </span>
          </div>
        </div>
      </Card.Content>
    </Card>
  );
}
