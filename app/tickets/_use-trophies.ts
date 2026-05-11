"use client";

import useSWR from "swr";
import type { Address } from "@solana/kit";
import { useCluster } from "../components/cluster-context";
import { getClusterUrl } from "../lib/solana-client";
import type { TrophyAsset } from "./components/trophy-card";

/**
 * DAS API shape — Helius/Triton/QuickNode return the same payload for
 * `getAssetsByGroup` and `getAssetsByOwner` (Metaplex DAS standard).
 */
type DasAsset = {
  id: string;
  content?: {
    metadata?: { name?: string };
    links?: { image?: string };
    files?: Array<{ uri?: string; mime?: string }>;
  };
  ownership?: { owner?: string };
  grouping?: Array<{ group_key: string; group_value: string }>;
};

function toTrophy(asset: DasAsset): TrophyAsset {
  const image =
    asset.content?.links?.image ?? asset.content?.files?.[0]?.uri ?? undefined;
  return {
    id: asset.id,
    owner: asset.ownership?.owner ?? "",
    name: asset.content?.metadata?.name ?? "BlinkPot Trophy",
    imageUrl: image,
  };
}

async function dasGetAssetsByGroup(
  rpcUrl: string,
  collection: string
): Promise<DasAsset[]> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "trophies",
      method: "getAssetsByGroup",
      params: {
        groupKey: "collection",
        groupValue: collection,
        page: 1,
        limit: 200,
      },
    }),
  });
  if (!res.ok) throw new Error(`DAS error ${res.status}`);
  const data = await res.json();
  if (data?.error) {
    throw new Error(data.error.message ?? "DAS error");
  }
  return (data?.result?.items ?? []) as DasAsset[];
}

/**
 * Fetch every trophy minted into `collection`. Refreshes when the cluster or
 * collection changes; SWR caches the result for the session.
 */
export function useAllTrophies(collection?: Address | string) {
  const { cluster } = useCluster();
  const url = getClusterUrl(cluster);
  const enabled = !!collection;

  const { data, error, isLoading, mutate } = useSWR(
    enabled ? (["trophies", "all", cluster, collection] as const) : null,
    async ([, , , c]) => {
      const items = await dasGetAssetsByGroup(url, c as string);
      return items.map(toTrophy);
    },
    { revalidateOnFocus: false }
  );

  return { trophies: data ?? [], isLoading, error, refetch: mutate };
}
