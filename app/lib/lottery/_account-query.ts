"use client";

import useSWR from "swr";
import type { Address, MaybeAccount, ProgramDerivedAddress } from "@solana/kit";
import { useCluster } from "../../components/cluster-context";
import { useSolanaClient } from "../solana-client-context";
import type { SolanaClient } from "../solana-client";
import { pdaAddress } from "./addresses";
import { useAccountSubscription } from "./_account-subscription";

type Rpc = SolanaClient["rpc"];

type Existing<T extends object> = MaybeAccount<T> & {
  readonly exists: true;
  readonly data: T;
};

export function exists<T extends object>(
  account: MaybeAccount<T> | undefined
): account is Existing<T> {
  return !!account?.exists;
}

/**
 * Generic SWR-driven account query: derive a PDA, fetch the account at that
 * PDA, and live-revalidate via WebSocket. Used by every per-account hook in
 * `accounts.ts`.
 *
 * `args` parts that resolve to `undefined` disable the hook (returns
 * `data: undefined`); this lets callers pass conditional inputs without an
 * outer `if`.
 */
export function useLotteryAccount<TData extends object>(opts: {
  tag: string;
  args: ReadonlyArray<string | undefined>;
  derive: () => Promise<ProgramDerivedAddress>;
  fetch: (
    rpc: Rpc,
    address: Address,
    config: { commitment: "confirmed" }
  ) => Promise<MaybeAccount<TData>>;
}) {
  const { cluster } = useCluster();
  const client = useSolanaClient();
  const enabled = opts.args.every((a) => a !== undefined);

  const address = useSWR(
    enabled
      ? (["lottery", "pda", opts.tag, ...opts.args] as const)
      : null,
    async () => pdaAddress(await opts.derive()),
    { revalidateOnFocus: false }
  );

  const account = useSWR(
    address.data
      ? ([
          "lottery",
          "account",
          opts.tag,
          cluster,
          ...opts.args,
          address.data,
        ] as const)
      : null,
    async () =>
      opts.fetch(client.rpc, address.data as Address, {
        commitment: "confirmed",
      }),
    { revalidateOnFocus: true }
  );

  useAccountSubscription(address.data, () => account.mutate());

  return {
    ...account,
    address: address.data,
    account: account.data,
    data: exists(account.data) ? account.data.data : undefined,
    exists: !!account.data?.exists,
  };
}
