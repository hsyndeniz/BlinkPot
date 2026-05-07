"use client";

import useSWR from "swr";
import { type Address, type Lamports } from "@solana/kit";
import { useCluster } from "../../components/cluster-context";
import { useSolanaClient } from "../solana-client-context";
import { useAccountSubscription } from "../lottery/_account-subscription";

const REFRESH_MS = 60_000;

export function useBalance(address?: Address) {
  const { cluster } = useCluster();
  const client = useSolanaClient();

  const result = useSWR(
    address ? (["balance", cluster, address] as const) : null,
    async ([, , addr]) => {
      const { value } = await client.rpc.getBalance(addr).send();
      return value;
    },
    { refreshInterval: REFRESH_MS, revalidateOnFocus: true }
  );

  useAccountSubscription(address, () => result.mutate());

  return {
    lamports: (result.data ?? null) as Lamports | null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.mutate,
  };
}
