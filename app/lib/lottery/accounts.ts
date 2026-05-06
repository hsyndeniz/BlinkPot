"use client";

import { useEffect, useMemo } from "react";
import useSWR from "swr";
import {
  fetchAllMaybeRound,
  fetchAllMaybeTicket,
  fetchMaybeBuyerEntry,
  fetchMaybeCompoundState,
  fetchMaybeConfig,
  fetchMaybeLpPosition,
  fetchMaybeLpVault,
  fetchMaybeReferral,
  fetchMaybeRound,
  fetchMaybeRoundCounter,
  fetchMaybeSubscription,
  getTicketDecoder,
  getTicketDiscriminatorBytes,
  type BuyerEntry,
  type CompoundState,
  type Config,
  type LpPosition,
  type LpVault,
  type Referral,
  type Round,
  type RoundCounter,
  type Subscription,
  type Ticket,
} from "../../generated/lottery";
import type { Address, MaybeAccount } from "@solana/kit";
import { useCluster } from "../../components/cluster-context";
import { useSolanaClient } from "../solana-client-context";
import {
  findBuyerEntryPda,
  findCompoundStatePda,
  findConfigPda,
  findLpVaultPda,
  findPositionPda,
  findReferralPda,
  findRoundCounterPda,
  findRoundPda,
  findSubscriptionPda,
  findTicketPda,
  LOTTERY_PROGRAM_ID,
  pdaAddress,
  u64Le,
} from "./addresses";

type Maybe<T extends object> = MaybeAccount<T> | undefined;
type Existing<T extends object> = MaybeAccount<T> & {
  readonly exists: true;
  readonly data: T;
};

function exists<T extends object>(account: Maybe<T>): account is Existing<T> {
  return !!account?.exists;
}

function bytesToBase64(bytes: ArrayLike<number>): string {
  if (typeof btoa === "function") {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  return Buffer.from(Array.from(bytes)).toString("base64");
}

function base64ToBytes(value: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(value, "base64"));
}

function useAccountSubscription(
  address: Address | undefined,
  revalidate: () => void
) {
  const client = useSolanaClient();

  useEffect(() => {
    if (!address) return;
    const abortController = new AbortController();

    const subscribe = async () => {
      try {
        const notifications = await client.rpcSubscriptions
          .accountNotifications(address, { commitment: "confirmed" })
          .subscribe({ abortSignal: abortController.signal });

        for await (const notification of notifications) {
          void notification;
          revalidate();
        }
      } catch {
        // SWR focus and explicit post-transaction invalidation remain as fallback.
      }
    };

    void subscribe();
    return () => abortController.abort();
  }, [address, client, revalidate]);
}

export function useConfig() {
  const { cluster } = useCluster();
  const client = useSolanaClient();

  const address = useSWR(
    ["lottery", "pda", "config"] as const,
    async () => pdaAddress(await findConfigPda()),
    { revalidateOnFocus: false }
  );

  const result = useSWR(
    address.data
      ? (["lottery", "account", "config", cluster, address.data] as const)
      : null,
    async ([, , , , configAddress]) =>
      fetchMaybeConfig(client.rpc, configAddress, { commitment: "confirmed" }),
    { revalidateOnFocus: true }
  );

  useAccountSubscription(address.data, () => result.mutate());

  return {
    ...result,
    address: address.data,
    account: result.data as MaybeAccount<Config> | undefined,
    config: exists(result.data) ? result.data.data : undefined,
    exists: !!result.data?.exists,
  };
}

export function useRoundCounter() {
  const { cluster } = useCluster();
  const client = useSolanaClient();

  const address = useSWR(
    ["lottery", "pda", "roundCounter"] as const,
    async () => pdaAddress(await findRoundCounterPda()),
    { revalidateOnFocus: false }
  );

  const result = useSWR(
    address.data
      ? (["lottery", "account", "roundCounter", cluster, address.data] as const)
      : null,
    async ([, , , , counterAddress]) =>
      fetchMaybeRoundCounter(client.rpc, counterAddress, {
        commitment: "confirmed",
      }),
    { revalidateOnFocus: true }
  );

  useAccountSubscription(address.data, () => result.mutate());

  return {
    ...result,
    address: address.data,
    account: result.data as MaybeAccount<RoundCounter> | undefined,
    counter: exists(result.data) ? result.data.data : undefined,
    exists: !!result.data?.exists,
  };
}

export function useRound(roundId?: bigint | number) {
  const { cluster } = useCluster();
  const client = useSolanaClient();
  const normalized = roundId == null ? undefined : BigInt(roundId);

  const address = useSWR(
    normalized != null
      ? (["lottery", "pda", "round", normalized.toString()] as const)
      : null,
    async ([, , , id]) => pdaAddress(await findRoundPda(BigInt(id))),
    { revalidateOnFocus: false }
  );

  const result = useSWR(
    address.data
      ? ([
          "lottery",
          "account",
          "round",
          cluster,
          normalized?.toString(),
          address.data,
        ] as const)
      : null,
    async ([, , , , , roundAddress]) =>
      fetchMaybeRound(client.rpc, roundAddress, { commitment: "confirmed" }),
    { revalidateOnFocus: true }
  );

  useAccountSubscription(address.data, () => result.mutate());

  return {
    ...result,
    address: address.data,
    account: result.data as MaybeAccount<Round> | undefined,
    round: exists(result.data) ? result.data.data : undefined,
    exists: !!result.data?.exists,
  };
}

export function useCurrentRound() {
  const counter = useRoundCounter();
  const currentRoundId = counter.counter?.currentRoundId;
  const round = useRound(
    currentRoundId && currentRoundId > 0n ? currentRoundId : undefined
  );

  return {
    ...round,
    counter,
    currentRoundId,
  };
}

export function useRounds(range: { from?: bigint; to?: bigint } = {}) {
  const { cluster } = useCluster();
  const client = useSolanaClient();
  const counter = useRoundCounter();

  const ids = useMemo(() => {
    const current = counter.counter?.currentRoundId ?? 0n;
    const to = range.to ?? current;
    const from = range.from ?? (to > 5n ? to - 5n : 1n);
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

export function useLpVault() {
  const { cluster } = useCluster();
  const client = useSolanaClient();

  const address = useSWR(
    ["lottery", "pda", "lpVault"] as const,
    async () => pdaAddress(await findLpVaultPda()),
    { revalidateOnFocus: false }
  );

  const result = useSWR(
    address.data
      ? (["lottery", "account", "lpVault", cluster, address.data] as const)
      : null,
    async ([, , , , lpVaultAddress]) =>
      fetchMaybeLpVault(client.rpc, lpVaultAddress, {
        commitment: "confirmed",
      }),
    { revalidateOnFocus: true }
  );

  useAccountSubscription(address.data, () => result.mutate());

  return {
    ...result,
    address: address.data,
    account: result.data as MaybeAccount<LpVault> | undefined,
    lpVault: exists(result.data) ? result.data.data : undefined,
    exists: !!result.data?.exists,
  };
}

export function useLpPosition(owner?: Address) {
  const { cluster } = useCluster();
  const client = useSolanaClient();

  const address = useSWR(
    owner ? (["lottery", "pda", "lpPosition", owner] as const) : null,
    async ([, , , positionOwner]) =>
      pdaAddress(await findPositionPda({ owner: positionOwner })),
    { revalidateOnFocus: false }
  );

  const result = useSWR(
    address.data
      ? ([
          "lottery",
          "account",
          "lpPosition",
          cluster,
          owner,
          address.data,
        ] as const)
      : null,
    async ([, , , , , positionAddress]) =>
      fetchMaybeLpPosition(client.rpc, positionAddress, {
        commitment: "confirmed",
      }),
    { revalidateOnFocus: true }
  );

  useAccountSubscription(address.data, () => result.mutate());

  return {
    ...result,
    address: address.data,
    account: result.data as MaybeAccount<LpPosition> | undefined,
    position: exists(result.data) ? result.data.data : undefined,
    exists: !!result.data?.exists,
  };
}

export function useReferral(owner?: Address) {
  const { cluster } = useCluster();
  const client = useSolanaClient();

  const address = useSWR(
    owner ? (["lottery", "pda", "referral", owner] as const) : null,
    async ([, , , referralOwner]) =>
      pdaAddress(await findReferralPda({ referrer: referralOwner })),
    { revalidateOnFocus: false }
  );

  const result = useSWR(
    address.data
      ? ([
          "lottery",
          "account",
          "referral",
          cluster,
          owner,
          address.data,
        ] as const)
      : null,
    async ([, , , , , referralAddress]) =>
      fetchMaybeReferral(client.rpc, referralAddress, {
        commitment: "confirmed",
      }),
    { revalidateOnFocus: true }
  );

  useAccountSubscription(address.data, () => result.mutate());

  return {
    ...result,
    address: address.data,
    account: result.data as MaybeAccount<Referral> | undefined,
    referral: exists(result.data) ? result.data.data : undefined,
    exists: !!result.data?.exists,
  };
}

export function useSubscription(owner?: Address) {
  const { cluster } = useCluster();
  const client = useSolanaClient();

  const address = useSWR(
    owner ? (["lottery", "pda", "subscription", owner] as const) : null,
    async ([, , , subOwner]) =>
      pdaAddress(await findSubscriptionPda({ owner: subOwner })),
    { revalidateOnFocus: false }
  );

  const result = useSWR(
    address.data
      ? ([
          "lottery",
          "account",
          "subscription",
          cluster,
          owner,
          address.data,
        ] as const)
      : null,
    async ([, , , , , subscriptionAddress]) =>
      fetchMaybeSubscription(client.rpc, subscriptionAddress, {
        commitment: "confirmed",
      }),
    { revalidateOnFocus: true }
  );

  useAccountSubscription(address.data, () => result.mutate());

  return {
    ...result,
    address: address.data,
    account: result.data as MaybeAccount<Subscription> | undefined,
    subscription: exists(result.data) ? result.data.data : undefined,
    exists: !!result.data?.exists,
  };
}

export function useBuyerEntry(roundId?: bigint | number, owner?: Address) {
  const { cluster } = useCluster();
  const client = useSolanaClient();
  const normalized = roundId == null ? undefined : BigInt(roundId);

  const address = useSWR(
    normalized != null && owner
      ? ([
          "lottery",
          "pda",
          "buyerEntry",
          normalized.toString(),
          owner,
        ] as const)
      : null,
    async ([, , , id, buyer]) =>
      pdaAddress(await findBuyerEntryPda({ roundId: BigInt(id), buyer })),
    { revalidateOnFocus: false }
  );

  const result = useSWR(
    address.data
      ? ([
          "lottery",
          "account",
          "buyerEntry",
          cluster,
          normalized?.toString(),
          owner,
          address.data,
        ] as const)
      : null,
    async ([, , , , , , buyerEntryAddress]) =>
      fetchMaybeBuyerEntry(client.rpc, buyerEntryAddress, {
        commitment: "confirmed",
      }),
    { revalidateOnFocus: true }
  );

  useAccountSubscription(address.data, () => result.mutate());

  return {
    ...result,
    address: address.data,
    account: result.data as MaybeAccount<BuyerEntry> | undefined,
    buyerEntry: exists(result.data) ? result.data.data : undefined,
    exists: !!result.data?.exists,
  };
}

export function useTickets(roundId?: bigint | number, owner?: Address) {
  const { cluster } = useCluster();
  const client = useSolanaClient();
  const normalized = roundId == null ? undefined : BigInt(roundId);
  const buyerEntry = useBuyerEntry(normalized, owner);

  const ticketCount = buyerEntry.buyerEntry?.ticketCount ?? 0n;
  const cappedTicketCount = ticketCount > 500n ? 500 : Number(ticketCount);

  const addresses = useSWR(
    normalized != null && owner && cappedTicketCount > 0
      ? ([
          "lottery",
          "pdas",
          "tickets",
          normalized.toString(),
          owner,
          cappedTicketCount,
        ] as const)
      : null,
    async ([, , , id, ticketOwner, count]) => {
      const list: Address[] = [];
      for (let i = 0; i < count; i += 1) {
        list.push(
          pdaAddress(
            await findTicketPda({
              roundId: BigInt(id),
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
          normalized?.toString(),
          owner,
          addresses.data.join(","),
        ] as const)
      : null,
    async () =>
      fetchAllMaybeTicket(client.rpc, addresses.data ?? [], {
        commitment: "confirmed",
      }),
    { revalidateOnFocus: true }
  );

  useEffect(() => {
    if (!addresses.data?.length) return;
    const abortController = new AbortController();
    let stopped = false;

    const subscribe = async (address: Address) => {
      try {
        const notifications = await client.rpcSubscriptions
          .accountNotifications(address, { commitment: "confirmed" })
          .subscribe({ abortSignal: abortController.signal });
        for await (const notification of notifications) {
          void notification;
          if (!stopped) result.mutate();
        }
      } catch {
        // Revalidation on action/focus remains as fallback.
      }
    };

    for (const address of addresses.data) void subscribe(address);
    return () => {
      stopped = true;
      abortController.abort();
    };
  }, [addresses.data, client, result]);

  return {
    ...result,
    addresses: addresses.data ?? [],
    buyerEntry,
    tickets: (result.data ?? []).filter(exists),
    isTruncated: ticketCount > BigInt(cappedTicketCount),
  };
}

export function useCompoundState(owner?: Address) {
  const { cluster } = useCluster();
  const client = useSolanaClient();

  const address = useSWR(
    owner ? (["lottery", "pda", "compoundState", owner] as const) : null,
    async ([, , , compoundOwner]) =>
      pdaAddress(await findCompoundStatePda({ buyer: compoundOwner })),
    { revalidateOnFocus: false }
  );

  const result = useSWR(
    address.data
      ? ([
          "lottery",
          "account",
          "compoundState",
          cluster,
          owner,
          address.data,
        ] as const)
      : null,
    async ([, , , , , compoundAddress]) =>
      fetchMaybeCompoundState(client.rpc, compoundAddress, {
        commitment: "confirmed",
      }),
    { revalidateOnFocus: true }
  );

  useAccountSubscription(address.data, () => result.mutate());

  return {
    ...result,
    address: address.data,
    account: result.data as MaybeAccount<CompoundState> | undefined,
    compoundState: exists(result.data) ? result.data.data : undefined,
    exists: !!result.data?.exists,
  };
}

export function useTicketScan(roundId?: bigint | number) {
  const { cluster } = useCluster();
  const client = useSolanaClient();
  const normalized = roundId == null ? undefined : BigInt(roundId);

  const result = useSWR(
    normalized != null
      ? ([
          "lottery",
          "scan",
          "tickets",
          cluster,
          normalized.toString(),
        ] as const)
      : null,
    async ([, , , , id]) => {
      const response = await client.rpc
        .getProgramAccounts(LOTTERY_PROGRAM_ID, {
          commitment: "confirmed",
          encoding: "base64",
          filters: [
            // Note: dataSize filter omitted intentionally — Ticket::LEN is
            // the authoritative size; getProgramAccounts matches full account
            // allocation which may differ across deployments. Discriminator +
            // round_id memcmp together are already unique identifiers.
            {
              memcmp: {
                offset: 0n,
                encoding: "base64",
                bytes: bytesToBase64(getTicketDiscriminatorBytes()) as never,
              },
            },
            {
              memcmp: {
                offset: 8n,
                encoding: "base64",
                bytes: bytesToBase64(u64Le(BigInt(id))) as never,
              },
            },
          ],
        })
        .send();

      const decoder = getTicketDecoder();
      return response
        .map((item) => {
          const [encoded] = item.account.data as readonly [string, string];
          return {
            address: item.pubkey as Address,
            data: decoder.decode(base64ToBytes(encoded)),
          };
        })
        .sort((a, b) => {
          if (a.data.owner === b.data.owner) {
            return Number(a.data.ticketIndex - b.data.ticketIndex);
          }
          return a.data.owner.localeCompare(b.data.owner);
        });
    },
    { revalidateOnFocus: true }
  );

  return {
    ...result,
    tickets: (result.data ?? []) as { address: Address; data: Ticket }[],
  };
}
