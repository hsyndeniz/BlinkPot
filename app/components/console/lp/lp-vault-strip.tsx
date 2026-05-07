"use client";

import type { Address } from "@solana/kit";
import type { LpVault } from "../../../generated/lottery";
import { Metric, MetricGrid, TokenAmount } from "../shared";

const SHARE_SCALE = 1_000_000_000_000n;

function sharePriceQ(totalShares: bigint, totalAssets: bigint): bigint {
  if (totalShares === 0n) return SHARE_SCALE;
  return (totalAssets * SHARE_SCALE) / totalShares;
}

export function LpVaultStrip(props: {
  lpVault: LpVault | undefined;
  paymentMint?: Address;
  decimals: number;
}) {
  const { lpVault, paymentMint, decimals } = props;
  if (!lpVault) return null;

  const sharePrice = sharePriceQ(lpVault.totalShares, lpVault.totalAssets);
  const sharePriceDisplay =
    Number(sharePrice) / Number(SHARE_SCALE);

  return (
    <MetricGrid columns={3}>
      <Metric
        label="Total assets"
        value={
          <TokenAmount
            amount={lpVault.totalAssets}
            decimals={decimals}
            mint={paymentMint}
            showSymbol={false}
          />
        }
      />
      <Metric
        label="Total shares"
        value={lpVault.totalShares.toString()}
        subvalue="u128"
      />
      <Metric
        label="Share price"
        value={sharePriceDisplay.toFixed(6)}
        subvalue="assets per share"
      />
      <Metric
        label="Pending withdrawals"
        value={lpVault.pendingWithdrawShares.toString()}
        subvalue="shares queued"
      />
      <Metric
        label="Lifetime edge earned"
        value={
          <TokenAmount
            amount={lpVault.lifetimeEdgeEarned}
            decimals={decimals}
            mint={paymentMint}
            showSymbol={false}
          />
        }
      />
      <Metric
        label="Lifetime jackpot loss"
        value={
          <TokenAmount
            amount={lpVault.lifetimeJackpotLoss}
            decimals={decimals}
            mint={paymentMint}
            showSymbol={false}
          />
        }
        tone={lpVault.lifetimeJackpotLoss > 0n ? "warn" : "neutral"}
      />
    </MetricGrid>
  );
}
