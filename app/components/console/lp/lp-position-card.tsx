"use client";

import type { Address } from "@solana/kit";
import type { LpPosition, LpVault } from "../../../generated/lottery";
import {
  EmptyState,
  MetricGrid,
  Metric,
  RelativeTime,
  StatusBadge,
  TokenAmount,
} from "../shared";

function assetsForShares(
  shares: bigint,
  totalShares: bigint,
  totalAssets: bigint
): bigint {
  if (totalShares === 0n) return 0n;
  return (shares * totalAssets) / totalShares;
}

export function LpPositionCard(props: {
  position: LpPosition | undefined;
  lpVault: LpVault | undefined;
  currentRoundId: bigint | undefined;
  paymentMint?: Address;
  decimals: number;
}) {
  const { position, lpVault, currentRoundId, paymentMint, decimals } = props;
  if (!position?.initialized) {
    return (
      <EmptyState
        title="No LP position"
        description="Deposit to mint your first shares of the LP pool."
      />
    );
  }

  const activeAssets = lpVault
    ? assetsForShares(position.shares, lpVault.totalShares, lpVault.totalAssets)
    : undefined;
  const pendingAssets = lpVault
    ? assetsForShares(
        position.pendingWithdrawShares,
        lpVault.totalShares,
        lpVault.totalAssets
      )
    : undefined;

  const eligibleToFinalize =
    position.pendingWithdrawShares > 0n &&
    currentRoundId != null &&
    currentRoundId > position.pendingWithdrawRound;

  return (
    <div className="grid gap-3">
      <MetricGrid columns={3}>
        <Metric
          label="Active shares"
          value={position.shares.toString()}
          subvalue={
            activeAssets != null ? (
              <TokenAmount
                amount={activeAssets}
                decimals={decimals}
                mint={paymentMint}
              />
            ) : undefined
          }
        />
        <Metric
          label="Pending shares"
          value={position.pendingWithdrawShares.toString()}
          subvalue={
            pendingAssets != null ? (
              <TokenAmount
                amount={pendingAssets}
                decimals={decimals}
                mint={paymentMint}
              />
            ) : undefined
          }
        />
        <Metric
          label="Pending round"
          value={
            position.pendingWithdrawShares > 0n
              ? `#${position.pendingWithdrawRound.toString()}`
              : "—"
          }
          subvalue={
            position.pendingWithdrawShares > 0n ? (
              eligibleToFinalize ? (
                <StatusBadge tone="good">eligible to finalize</StatusBadge>
              ) : (
                <StatusBadge tone="warn">cooldown active</StatusBadge>
              )
            ) : undefined
          }
        />
        <Metric
          label="Last deposit"
          value={
            <RelativeTime
              unixSeconds={position.lastDepositAt}
              fallback="—"
              showAbsolute={false}
            />
          }
        />
        <Metric
          label="Initiated at"
          value={
            <RelativeTime
              unixSeconds={position.pendingWithdrawInitiatedAt}
              fallback="—"
              showAbsolute={false}
            />
          }
        />
      </MetricGrid>
    </div>
  );
}
