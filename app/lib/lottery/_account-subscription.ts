"use client";

import { useEffect } from "react";
import type { Address } from "@solana/kit";
import { useSolanaClient } from "../solana-client-context";

/**
 * Subscribe to account notifications for `address` and invoke `revalidate`
 * whenever the account changes. WebSocket failures are swallowed silently —
 * SWR focus revalidation and post-transaction invalidation are the fallback.
 */
export function useAccountSubscription(
  address: Address | undefined,
  revalidate: () => void
) {
  const client = useSolanaClient();

  useEffect(() => {
    if (!address) return;
    const abort = new AbortController();

    void (async () => {
      try {
        const notifications = await client.rpcSubscriptions
          .accountNotifications(address, { commitment: "confirmed" })
          .subscribe({ abortSignal: abort.signal });
        for await (const _ of notifications) {
          void _;
          revalidate();
        }
      } catch {
        // Fall back to SWR focus revalidation.
      }
    })();

    return () => abort.abort();
  }, [address, client, revalidate]);
}
