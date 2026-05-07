"use client";

import { useEffect, useMemo } from "react";
import useSWR from "swr";
import type { Address } from "@solana/kit";
import {
  fetchAllMaybeRound,
  fetchAllMaybeTicket,
  fetchMaybeBuyerEntry,
  fetchMaybeConfig,
  fetchMaybeLpPosition,
  fetchMaybeLpVault,
  fetchMaybeReferral,
  fetchMaybeRound,
  fetchMaybeRoundCounter,
  fetchMaybeSubscription,
} from "../../generated/lottery";
import { useCluster } from "../../components/cluster-context";
import { useSolanaClient } from "../solana-client-context";
import {
  findBuyerEntryPda,
  findConfigPda,
  findLpVaultPda,
  findPositionPda,
  findReferralPda,
  findRoundCounterPda,
  findRoundPda,
  findSubscriptionPda,
  findTicketPda,
  pdaAddress,
} from "./addresses";
import { useLotteryAccount, exists } from "./_account-query";

// ─── single-account hooks ──────────────────────────────────────────────────
// All of these wrap the same SWR + WebSocket subscription pattern via
// `useLotteryAccount`. Each just wires its own PDA derivation, codama fetcher,
// and renames `data` → a domain-specific property name for backwards-compat
// with existing call sites.

export function useConfig() {
  const out = useLotteryAccount({
    tag: "config",
    args: [],
    derive: () => findConfigPda(),
    fetch: fetchMaybeConfig,
  });
  return { ...out, config: out.data };
}

export function useRoundCounter() {
  const out = useLotteryAccount({
    tag: "roundCounter",
    args: [],
    derive: () => findRoundCounterPda(),
    fetch: fetchMaybeRoundCounter,
  });
  return { ...out, counter: out.data };
}

export function useRound(roundId?: bigint | number) {
  const id = roundId == null ? undefined : BigInt(roundId);
  const out = useLotteryAccount({
    tag: "round",
    args: [id?.toString()],
    derive: () => findRoundPda(id as bigint),
    fetch: fetchMaybeRound,
  });
  return { ...out, round: out.data };
}

export function useCurrentRound() {
  const counter = useRoundCounter();
  const currentRoundId = counter.counter?.currentRoundId;
  const round = useRound(
    currentRoundId && currentRoundId > 0n ? currentRoundId : undefined
  );
  return { ...round, counter, currentRoundId };
}

export function useLpVault() {
  const out = useLotteryAccount({
    tag: "lpVault",
    args: [],
    derive: () => findLpVaultPda(),
    fetch: fetchMaybeLpVault,
  });
  return { ...out, lpVault: out.data };
}

export function useLpPosition(owner?: Address) {
  const out = useLotteryAccount({
    tag: "lpPosition",
    args: [owner],
    derive: () => findPositionPda({ owner: owner as Address }),
    fetch: fetchMaybeLpPosition,
  });
  return { ...out, position: out.data };
}

export function useReferral(owner?: Address) {
  const out = useLotteryAccount({
    tag: "referral",
    args: [owner],
    derive: () => findReferralPda({ referrer: owner as Address }),
    fetch: fetchMaybeReferral,
  });
  return { ...out, referral: out.data };
}

export function useSubscription(owner?: Address) {
  const out = useLotteryAccount({
    tag: "subscription",
    args: [owner],
    derive: () => findSubscriptionPda({ owner: owner as Address }),
    fetch: fetchMaybeSubscription,
  });
  return { ...out, subscription: out.data };
}

export function useBuyerEntry(roundId?: bigint | number, owner?: Address) {
  const id = roundId == null ? undefined : BigInt(roundId);
  const out = useLotteryAccount({
    tag: "buyerEntry",
    args: [id?.toString(), owner],
    derive: () =>
      findBuyerEntryPda({
        roundId: id as bigint,
        buyer: owner as Address,
      }),
    fetch: fetchMaybeBuyerEntry,
  });
  return { ...out, buyerEntry: out.data };
}

// ─── batch / range queries ─────────────────────────────────────────────────

const ROUNDS_PAGE_DEFAULT = 5n;

export function useRounds(range: { from?: bigint; to?: bigint } = {}) {
  const { cluster } = useCluster();
  const client = useSolanaClient();
  const counter = useRoundCounter();

  const ids = useMemo(() => {
    const current = counter.counter?.currentRoundId ?? 0n;
    const to = range.to ?? current;
    const from =
      range.from ?? (to > ROUNDS_PAGE_DEFAULT ? to - ROUNDS_PAGE_DEFAULT : 1n);
    const out: bigint[] = [];
    for (let id = from; id <= to && id > 0n; id += 1n) out.push(id);
    return out.reverse();
  }, [counter.counter?.currentRoundId, range.from, range.to]);

  const result = useSWR(
    ids.length > 0
      ? (["lottery", "rounds", cluster, ids.join(",")] as const)
      : null,
    async () => {
      const addresses = await Promise.all(
        ids.map((id) => findRoundPda(id).then(pdaAddress))
      );
      return fetchAllMaybeRound(client.rpc, addresses, {
        commitment: "confirmed",
      });
    },
    { revalidateOnFocus: true }
  );

  return {
    ...result,
    ids,
    rounds: (result.data ?? []).filter(exists),
  };
}

const TICKETS_RPC_BATCH = 100;
const TICKETS_DISPLAY_CAP = 500;

export function useTickets(roundId?: bigint | number, owner?: Address) {
  const { cluster } = useCluster();
  const client = useSolanaClient();
  const id = roundId == null ? undefined : BigInt(roundId);
  const buyerEntry = useBuyerEntry(id, owner);

  const ticketCount = buyerEntry.buyerEntry?.ticketCount ?? 0n;
  const cappedCount =
    ticketCount > BigInt(TICKETS_DISPLAY_CAP)
      ? TICKETS_DISPLAY_CAP
      : Number(ticketCount);

  const addresses = useSWR(
    id != null && owner && cappedCount > 0
      ? ([
          "lottery",
          "pdas",
          "tickets",
          id.toString(),
          owner,
          cappedCount,
        ] as const)
      : null,
    async ([, , , idStr, ticketOwner, count]) => {
      const list: Address[] = [];
      for (let i = 0; i < count; i += 1) {
        list.push(
          pdaAddress(
            await findTicketPda({
              roundId: BigInt(idStr),
              owner: ticketOwner,
              ticketIndex: BigInt(i),
            })
          )
        );
      }
      return list;
    },
    { revalidateOnFocus: false }
  );

  const result = useSWR(
    addresses.data?.length
      ? ([
          "lottery",
          "accounts",
          "tickets",
          cluster,
          id?.toString(),
          owner,
          addresses.data.join(","),
        ] as const)
      : null,
    async () => {
      const all = addresses.data ?? [];
      if (all.length === 0) return [];
      const batches: Address[][] = [];
      for (let i = 0; i < all.length; i += TICKETS_RPC_BATCH) {
        batches.push(all.slice(i, i + TICKETS_RPC_BATCH));
      }
      const responses = await Promise.all(
        batches.map((batch) =>
          fetchAllMaybeTicket(client.rpc, batch, {
            commitment: "confirmed",
          })
        )
      );
      return responses.flat();
    },
    { revalidateOnFocus: true }
  );

  // Subscribe to all ticket PDAs for live updates (claimed flag, etc.).
  useEffect(() => {
    if (!addresses.data?.length) return;
    const abort = new AbortController();
    let stopped = false;

    const subscribe = async (address: Address) => {
      try {
        const notifications = await client.rpcSubscriptions
          .accountNotifications(address, { commitment: "confirmed" })
          .subscribe({ abortSignal: abort.signal });
        for await (const _ of notifications) {
          void _;
          if (!stopped) result.mutate();
        }
      } catch {
        // Fall back to focus / post-action revalidation.
      }
    };

    for (const address of addresses.data) void subscribe(address);
    return () => {
      stopped = true;
      abort.abort();
    };
  }, [addresses.data, client, result]);

  return {
    ...result,
    addresses: addresses.data ?? [],
    buyerEntry,
    tickets: (result.data ?? []).filter(exists),
    isTruncated: ticketCount > BigInt(cappedCount),
  };
}
