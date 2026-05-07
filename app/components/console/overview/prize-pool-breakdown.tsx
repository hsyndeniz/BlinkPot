"use client";

import type { Address } from "@solana/kit";
import type { Round } from "../../../generated/lottery";
import { Panel, TokenAmount } from "../shared";

export function PrizePoolBreakdown(props: {
  round: Round | undefined;
  paymentMint?: Address;
  decimals: number;
}) {
  const { round, paymentMint, decimals } = props;
  if (!round) return null;

  const rows: { label: string; value: bigint; tone?: "muted" }[] = [
    { label: "Seed (rolled in)", value: round.seedPrizePool },
    { label: "LP guarantee reserved", value: round.lpGuaranteeReserved },
    {
      label: "Accrued from buys",
      value:
        round.prizePool -
        round.seedPrizePool -
        round.lpGuaranteeReserved >=
      0n
        ? round.prizePool -
          round.seedPrizePool -
          round.lpGuaranteeReserved
        : 0n,
    },
    { label: "LP edge accrued", value: round.lpEdgeAccrued, tone: "muted" },
    {
      label: "Referral fees accrued",
      value: round.referralFeesAccrued,
      tone: "muted",
    },
  ];

  return (
    <Panel title="Prize pool breakdown">
      <div className="grid gap-2 text-sm">
        {rows.map((row) => (
          <div
            key={row.label}
            className={`flex items-center justify-between gap-2 ${row.tone === "muted" ? "text-muted" : ""}`}
          >
            <span className="text-xs">{row.label}</span>
            <TokenAmount
              amount={row.value}
              decimals={decimals}
              mint={paymentMint}
            />
          </div>
        ))}
        <div className="mt-2 border-t border-border-low pt-2 text-base font-semibold">
          <div className="flex items-center justify-between gap-2">
            <span>Total prize pool</span>
            <TokenAmount
              amount={round.prizePool}
              decimals={decimals}
              mint={paymentMint}
            />
          </div>
        </div>
      </div>
    </Panel>
  );
}
