"use client";

import useSWR from "swr";
import type { Address, MaybeAccount } from "@solana/kit";
import {
  fetchAllMaybePickCounter,
  fetchMaybePickCounter,
  type PickCounter,
} from "../../generated/lottery";
import { useCluster } from "../../components/cluster-context";
import { useSolanaClient } from "../solana-client-context";
import { findPickCounterPda, pdaAddress } from "./addresses";

type Existing<T extends object> = MaybeAccount<T> & {
  readonly exists: true;
  readonly data: T;
};

function exists<T extends object>(
  account: MaybeAccount<T> | undefined
): account is Existing<T> {
  return !!account?.exists;
}

export function usePickCounter(input?: {
  roundId: bigint;
  normals: ArrayLike<number>;
  bonusball: number;
}) {
  const { cluster } = useCluster();
  const client = useSolanaClient();

  const normalsKey = input
    ? Array.from(input.normals).join(",")
    : undefined;

  const address = useSWR(
    input
      ? ([
          "lottery",
          "pda",
          "pickCounter",
          input.roundId.toString(),
          normalsKey,
          input.bonusball,
        ] as const)
      : null,
    async () => {
      if (!input) return undefined;
      return pdaAddress(
        await findPickCounterPda({
          roundId: input.roundId,
          normals: input.normals,
          bonusball: input.bonusball,
        })
      );
    },
    { revalidateOnFocus: false }
  );

  const result = useSWR(
    address.data
      ? ([
          "lottery",
          "account",
          "pickCounter",
          cluster,
          address.data,
        ] as const)
      : null,
    async ([, , , , pdaAddr]) =>
      fetchMaybePickCounter(client.rpc, pdaAddr, { commitment: "confirmed" }),
    { revalidateOnFocus: true }
  );

  return {
    ...result,
    address: address.data,
    account: result.data as MaybeAccount<PickCounter> | undefined,
    pickCounter: exists(result.data) ? result.data.data : undefined,
    exists: !!result.data?.exists,
  };
}

/**
 * Batch fetch pick counters for many tickets at once. Used by the ticket list to
 * compute exact per-ticket payouts (`per_combo_payout[tier] / pickCounter.count`).
 * Returns counts keyed by `${roundId}:${normals}:${bonusball}`.
 */
export function usePickCounters(
  picks: ReadonlyArray<{
    roundId: bigint;
    normals: ArrayLike<number>;
    bonusball: number;
  }>
) {
  const { cluster } = useCluster();
  const client = useSolanaClient();

  const cacheKey = picks
    .map(
      (p) =>
        `${p.roundId.toString()}:${Array.from(p.normals).join(",")}:${p.bonusball}`
    )
    .join("|");

  const result = useSWR(
    picks.length > 0
      ? (["lottery", "pickCounters", cluster, cacheKey] as const)
      : null,
    async () => {
      const addrs = await Promise.all(
        picks.map((p) =>
          findPickCounterPda({
            roundId: p.roundId,
            normals: p.normals,
            bonusball: p.bonusball,
          }).then(pdaAddress)
        )
      );

      // Batch RPC calls to avoid "Too many inputs" — same pattern as useTickets.
      const BATCH_SIZE = 100;
      const batches: Address[][] = [];
      for (let i = 0; i < addrs.length; i += BATCH_SIZE) {
        batches.push(addrs.slice(i, i + BATCH_SIZE));
      }
      const responses = await Promise.all(
        batches.map((batch) =>
          fetchAllMaybePickCounter(client.rpc, batch, {
            commitment: "confirmed",
          })
        )
      );
      const flat = responses.flat();

      const counts = new Map<string, number>();
      flat.forEach((account, i) => {
        if (!account.exists) return;
        const pick = picks[i];
        const key = `${pick.roundId.toString()}:${Array.from(pick.normals).join(",")}:${pick.bonusball}`;
        counts.set(key, account.data.count);
      });
      return counts;
    },
    { revalidateOnFocus: true }
  );

  return {
    ...result,
    counts: result.data ?? new Map<string, number>(),
  };
}

export function pickKey(
  roundId: bigint,
  normals: ArrayLike<number>,
  bonusball: number
): string {
  return `${roundId.toString()}:${Array.from(normals).join(",")}:${bonusball}`;
}
