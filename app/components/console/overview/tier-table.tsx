"use client";

import type { Address } from "@solana/kit";
import { useMemo } from "react";
import type { Config, Round } from "../../../generated/lottery";
import {
  TIER_COUNT,
  tierCombosTable,
  tierLabel,
} from "../../../lib/lottery/picks";
import { Panel, StatusBadge, TokenAmount } from "../shared";

type TierRow = {
  tier: number;
  matches: number;
  hasBonus: boolean;
  isWinning: boolean;
  isJackpot: boolean;
  combos: bigint;
  weightBps: number | undefined;
  minPayout: bigint | undefined;
  perCombo: bigint | undefined;
  paidCount: number | undefined;
  paidAmount: bigint | undefined;
};

function buildRows(input: {
  combos: bigint[];
  weights: ReadonlyArray<number> | undefined;
  isWinning: ReadonlyArray<boolean> | undefined;
  minPayouts: ReadonlyArray<bigint> | undefined;
  perCombo: ReadonlyArray<bigint> | undefined;
  paidCounts: ReadonlyArray<number> | undefined;
  paidAmounts: ReadonlyArray<bigint> | undefined;
}): TierRow[] {
  return Array.from({ length: TIER_COUNT }, (_, t) => {
    const { matches, hasBonus } = tierLabel(t);
    return {
      tier: t,
      matches,
      hasBonus,
      isWinning: input.isWinning?.[t] ?? false,
      isJackpot: t === 11,
      combos: input.combos[t] ?? 0n,
      weightBps: input.weights?.[t],
      minPayout: input.minPayouts?.[t],
      perCombo: input.perCombo?.[t],
      paidCount: input.paidCounts?.[t],
      paidAmount: input.paidAmounts?.[t],
    };
  });
}

function TierBadge(props: { row: TierRow }) {
  const { matches, hasBonus, tier, isJackpot } = props.row;
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`inline-flex h-6 min-w-6 items-center justify-center rounded-md border px-1.5 text-[11px] font-mono ${
          isJackpot
            ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
            : "border-border-low bg-card text-foreground"
        }`}
      >
        T{tier}
      </span>
      <span className="text-xs">
        <span className="font-mono">{matches}N</span>
        {hasBonus && (
          <span className="ml-0.5 text-amber-600 dark:text-amber-400">
            +B
          </span>
        )}
      </span>
    </span>
  );
}

export function TierTable(props: {
  round?: Round;
  config?: Config;
  paymentMint?: Address;
  decimals: number;
}) {
  const { round, config, paymentMint, decimals } = props;

  const normalMax = round?.normalBallMax ?? config?.normalBallMax ?? 30;
  const bonusMax = round?.bonusballMax ?? config?.bonusballMax ?? 15;

  const combos = useMemo(
    () => tierCombosTable(normalMax, bonusMax),
    [normalMax, bonusMax]
  );

  const rows = useMemo(
    () =>
      buildRows({
        combos,
        weights: config?.tierPremiumWeightBps,
        isWinning: round?.tierIsWinning ?? config?.tierIsWinning,
        minPayouts: config?.tierMinPayoutPerWinner,
        perCombo: round?.perComboPayout,
        paidCounts: round?.tierPaidCounts,
        paidAmounts: round?.tierPaidAmounts,
      }),
    [
      combos,
      config?.tierPremiumWeightBps,
      config?.tierIsWinning,
      config?.tierMinPayoutPerWinner,
      round?.tierIsWinning,
      round?.perComboPayout,
      round?.tierPaidCounts,
      round?.tierPaidAmounts,
    ]
  );

  // Show post-draw columns only when the round has actually drawn
  // (otherwise per_combo / paid_counts / paid_amounts are all zero).
  const hasDrawData =
    !!round?.perComboPayout?.some?.((v) => v > 0n) ||
    !!round?.tierPaidCounts?.some?.((v) => v > 0);

  return (
    <Panel
      title="Tier table"
      description={
        <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>
            Ranges: <span className="font-mono">1..{normalMax}</span> ·{" "}
            <span className="font-mono">1..{bonusMax}</span>
          </span>
          <span>·</span>
          <span>{TIER_COUNT} tiers</span>
          {hasDrawData && (
            <>
              <span>·</span>
              <StatusBadge tone="info">post-draw values shown</StatusBadge>
            </>
          )}
        </span>
      }
    >
      <DesktopTable
        rows={rows}
        decimals={decimals}
        paymentMint={paymentMint}
        hasDrawData={hasDrawData}
      />
      <MobileCards
        rows={rows}
        decimals={decimals}
        paymentMint={paymentMint}
        hasDrawData={hasDrawData}
      />
    </Panel>
  );
}

function DesktopTable(props: {
  rows: TierRow[];
  decimals: number;
  paymentMint?: Address;
  hasDrawData: boolean;
}) {
  const { rows, decimals, paymentMint, hasDrawData } = props;
  return (
    <div className="hidden md:block">
      <div className="overflow-hidden rounded-md border border-border-low">
        <table className="w-full table-fixed text-xs">
          <colgroup>
            <col className="w-[16%]" />
            <col className="w-[14%]" />
            <col className="w-[12%]" />
            <col className="w-[16%]" />
            {hasDrawData && (
              <>
                <col className="w-[18%]" />
                <col className="w-[10%]" />
                <col className="w-[14%]" />
              </>
            )}
          </colgroup>
          <thead>
            <tr className="border-b border-border-low bg-background/40 text-left text-[10px] uppercase tracking-wider text-muted">
              <th className="px-3 py-2 font-medium">Tier</th>
              <th className="px-3 py-2 text-right font-medium">Combos</th>
              <th className="px-3 py-2 text-right font-medium">Weight bps</th>
              <th className="px-3 py-2 text-right font-medium">Min payout</th>
              {hasDrawData && (
                <>
                  <th className="px-3 py-2 text-right font-medium">
                    Per-combo payout
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Winners</th>
                  <th className="px-3 py-2 text-right font-medium">Paid</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const baseTone = row.isWinning
                ? row.isJackpot
                  ? "bg-amber-500/[0.04]"
                  : "bg-card"
                : "bg-background/30 text-muted";
              const stripe = i % 2 === 1 && row.isWinning ? "bg-cream/40" : "";
              return (
                <tr
                  key={row.tier}
                  className={`border-t border-border-low transition hover:bg-cream/60 ${baseTone} ${stripe}`}
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <TierBadge row={row} />
                      {row.isJackpot && (
                        <StatusBadge
                          tone="warn"
                          className="!px-1.5 !py-0.5 !text-[9px]"
                        >
                          JACKPOT
                        </StatusBadge>
                      )}
                      {!row.isWinning && (
                        <StatusBadge
                          tone="neutral"
                          className="!px-1.5 !py-0.5 !text-[9px]"
                        >
                          non-winning
                        </StatusBadge>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {row.combos.toString()}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {row.weightBps ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {row.minPayout != null && row.minPayout > 0n ? (
                      <TokenAmount
                        amount={row.minPayout}
                        decimals={decimals}
                        mint={paymentMint}
                        showSymbol={false}
                      />
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  {hasDrawData && (
                    <>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {row.perCombo != null && row.perCombo > 0n ? (
                          <TokenAmount
                            amount={row.perCombo}
                            decimals={decimals}
                            mint={paymentMint}
                            showSymbol={false}
                          />
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {row.paidCount ?? 0}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {row.paidAmount != null && row.paidAmount > 0n ? (
                          <TokenAmount
                            amount={row.paidAmount}
                            decimals={decimals}
                            mint={paymentMint}
                            showSymbol={false}
                          />
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MobileCards(props: {
  rows: TierRow[];
  decimals: number;
  paymentMint?: Address;
  hasDrawData: boolean;
}) {
  const { rows, decimals, paymentMint, hasDrawData } = props;
  return (
    <div className="grid gap-2 md:hidden">
      {rows.map((row) => {
        const accent = row.isJackpot
          ? "border-l-amber-500/60"
          : row.isWinning
            ? "border-l-green-500/40"
            : "border-l-border-low";
        return (
          <div
            key={row.tier}
            className={`rounded-md border border-border-low border-l-4 ${accent} bg-background/40 p-3 ${
              row.isWinning ? "" : "opacity-70"
            }`}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <TierBadge row={row} />
              <div className="flex items-center gap-1.5">
                {row.isJackpot && (
                  <StatusBadge
                    tone="warn"
                    className="!px-1.5 !py-0.5 !text-[9px]"
                  >
                    JACKPOT
                  </StatusBadge>
                )}
                {!row.isWinning && (
                  <StatusBadge
                    tone="neutral"
                    className="!px-1.5 !py-0.5 !text-[9px]"
                  >
                    non-winning
                  </StatusBadge>
                )}
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
              <DefRow label="Combos">
                <span className="font-mono tabular-nums">
                  {row.combos.toString()}
                </span>
              </DefRow>
              <DefRow label="Weight bps">
                <span className="font-mono tabular-nums">
                  {row.weightBps ?? "—"}
                </span>
              </DefRow>
              <DefRow label="Min payout">
                {row.minPayout != null && row.minPayout > 0n ? (
                  <TokenAmount
                    amount={row.minPayout}
                    decimals={decimals}
                    mint={paymentMint}
                    showSymbol={false}
                  />
                ) : (
                  <span className="text-muted">—</span>
                )}
              </DefRow>
              {hasDrawData && (
                <>
                  <DefRow label="Per-combo">
                    {row.perCombo != null && row.perCombo > 0n ? (
                      <TokenAmount
                        amount={row.perCombo}
                        decimals={decimals}
                        mint={paymentMint}
                        showSymbol={false}
                      />
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </DefRow>
                  <DefRow label="Winners">
                    <span className="font-mono tabular-nums">
                      {row.paidCount ?? 0}
                    </span>
                  </DefRow>
                  <DefRow label="Paid">
                    {row.paidAmount != null && row.paidAmount > 0n ? (
                      <TokenAmount
                        amount={row.paidAmount}
                        decimals={decimals}
                        mint={paymentMint}
                        showSymbol={false}
                      />
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </DefRow>
                </>
              )}
            </dl>
          </div>
        );
      })}
    </div>
  );
}

function DefRow(props: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted">{props.label}</dt>
      <dd className="text-right">{props.children}</dd>
    </>
  );
}
