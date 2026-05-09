// Mirrors `shares_for_deposit` / `assets_for_shares` from the on-chain math
// module. Both directions use the same totalShares / totalAssets pair so the
// UI stays in lock-step with what the chain actually mints / burns.

export const INITIAL_SHARES_PER_TOKEN_UNIT = 1_000_000n;

export function sharesForDeposit(
  deposit: bigint,
  totalShares: bigint,
  totalAssets: bigint
): bigint {
  if (totalShares === 0n || totalAssets === 0n) {
    return deposit * INITIAL_SHARES_PER_TOKEN_UNIT;
  }
  return (deposit * totalShares) / totalAssets;
}

export function assetsForShares(
  shares: bigint,
  totalShares: bigint,
  totalAssets: bigint
): bigint {
  if (totalShares === 0n) return 0n;
  return (shares * totalAssets) / totalShares;
}
