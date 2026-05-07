"use client";

import useSWR from "swr";
import { useCluster } from "../../components/cluster-context";
import { useSolanaClient } from "../solana-client-context";
import { LOTTERY_PROGRAM_ID } from "./addresses";

export type ActivitySignature = {
  signature: string;
  slot: bigint;
  blockTime: bigint | null;
  err: unknown;
  memo: string | null;
};

const PAGE_SIZE = 20;

/**
 * Cursor-paginated signature feed for the lottery program. Each call returns up
 * to `PAGE_SIZE` signatures starting before `cursor` (or from the head if
 * cursor is undefined). The page contains the `nextCursor` to fetch older
 * entries — `null` means there are no more.
 */
export function useActivitySignatures(cursor?: string) {
  const { cluster } = useCluster();
  const client = useSolanaClient();

  const result = useSWR(
    [
      "lottery",
      "activity",
      "signatures",
      cluster,
      cursor ?? "head",
    ] as const,
    async () => {
      const response = await client.rpc
        .getSignaturesForAddress(LOTTERY_PROGRAM_ID, {
          limit: PAGE_SIZE,
          ...(cursor ? { before: cursor as never } : {}),
          commitment: "confirmed",
        })
        .send();
      const items: ActivitySignature[] = response.map((entry) => ({
        signature: entry.signature,
        slot: entry.slot as unknown as bigint,
        blockTime:
          entry.blockTime != null
            ? (entry.blockTime as unknown as bigint)
            : null,
        err: entry.err ?? null,
        memo: entry.memo ?? null,
      }));
      const nextCursor =
        items.length === PAGE_SIZE
          ? (items[items.length - 1].signature as string)
          : null;
      return { items, nextCursor };
    },
    { revalidateOnFocus: true }
  );

  return {
    ...result,
    items: result.data?.items ?? [],
    nextCursor: result.data?.nextCursor ?? null,
  };
}
