"use client";

import type { Address } from "@solana/kit";
import { formatTokenAmount, useTokenSymbol } from "../../../lib/lottery/tokens";

export function TokenAmount(props: {
  amount?: bigint | number | null;
  decimals: number;
  mint?: Address;
  symbol?: string;
  maxDecimals?: number;
  showSymbol?: boolean;
  className?: string;
}) {
  const { amount, decimals, mint, symbol, maxDecimals, showSymbol = true } = props;
  const resolvedSymbol = useTokenSymbol(mint);
  const displaySymbol = symbol ?? resolvedSymbol;

  if (amount == null) return <span className="text-muted">-</span>;
  const formatted = formatTokenAmount(amount, decimals, { maxDecimals });

  return (
    <span className={`tabular-nums ${props.className ?? ""}`}>
      {formatted}
      {showSymbol && (
        <span className="ml-1 text-xs font-normal text-muted">
          {displaySymbol}
        </span>
      )}
    </span>
  );
}
