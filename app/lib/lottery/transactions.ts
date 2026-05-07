"use client";

import { useCallback, useMemo, useState } from "react";
import { useSWRConfig, type Key, type ScopedMutator } from "swr";
import { createClient } from "@solana/kit-client-rpc";
import type { Address, Instruction } from "@solana/kit";
import { toast } from "sonner";
import { useCluster } from "../../components/cluster-context";
import { useWallet } from "../wallet/context";
import { parseTransactionError } from "../errors";
import { getClusterUrl, getClusterWsConfig } from "../solana-client";

export type LotteryActionPlan = {
  action: string;
  instructions: readonly Instruction[];
  expectedStateChange: string;
  feePayer?: Address;
  tokenAmount?: string;
  touchedAccounts?: readonly { label: string; address: Address }[];
  invalidate?: readonly Key[];
  allowMainnet?: boolean;
};

const MAX_PROMPT_ACCOUNTS = 12;

function summarizePlan(plan: LotteryActionPlan, cluster: string): string {
  const lines = [
    `Action: ${plan.action}`,
    `Cluster: ${cluster}`,
    `Fee payer: ${plan.feePayer ?? "connected wallet"}`,
    `Token amount: ${plan.tokenAmount ?? "none"}`,
    `Expected change: ${plan.expectedStateChange}`,
    `Instructions: ${plan.instructions.length}`,
  ];
  if (plan.touchedAccounts?.length) {
    lines.push("Accounts:");
    const visible = plan.touchedAccounts.slice(0, MAX_PROMPT_ACCOUNTS);
    for (const account of visible) {
      lines.push(`- ${account.label}: ${account.address}`);
    }
    const overflow = plan.touchedAccounts.length - MAX_PROMPT_ACCOUNTS;
    if (overflow > 0) lines.push(`- ... ${overflow} more`);
  }
  return lines.join("\n");
}

/** Invalidate the SWR caches that any successful lottery action could affect. */
async function invalidateLotteryCaches(
  mutate: ScopedMutator,
  extra: readonly Key[]
): Promise<void> {
  await mutate(
    (key: unknown) =>
      Array.isArray(key) && (key[0] === "lottery" || key[0] === "balance")
  );
  for (const key of extra) await mutate(key);
}

/**
 * Mark an error as already user-surfaced so upstream catchers don't re-toast.
 * The flag is read by `useActionTrigger` to decide whether to parse + display.
 */
function markErrorAsToastShown(err: unknown) {
  if (err && typeof err === "object") {
    (err as { lotteryToastShown?: boolean }).lotteryToastShown = true;
  }
}

export function useSendLotteryTransaction() {
  const { signer } = useWallet();
  const { cluster, getExplorerUrl } = useCluster();
  const { mutate } = useSWRConfig();
  const [isSending, setIsSending] = useState(false);

  const txClient = useMemo(
    () =>
      signer
        ? createClient({
            url: getClusterUrl(cluster),
            rpcSubscriptionsConfig: getClusterWsConfig(cluster),
            payer: signer,
            skipPreflight: false,
          })
        : null,
    [cluster, signer]
  );

  const send = useCallback(
    async (plan: LotteryActionPlan) => {
      if (!signer || !txClient) throw new Error("Wallet not connected");
      if (cluster === "mainnet" && !plan.allowMainnet) {
        throw new Error("Mainnet write actions are disabled for this console.");
      }
      if (plan.instructions.length === 0) {
        throw new Error("No instructions were built for this action.");
      }

      const confirmed =
        typeof window === "undefined" ||
        window.confirm(
          summarizePlan({ ...plan, feePayer: signer.address }, cluster)
        );
      if (!confirmed) return undefined;

      setIsSending(true);
      const toastId = toast.loading(`Simulating ${plan.action}...`);
      try {
        await txClient.planTransaction([...plan.instructions]);
        toast.loading(`Sending ${plan.action}...`, { id: toastId });
        const result = await txClient.sendTransaction([...plan.instructions]);
        const signature = result.context.signature;

        toast.success(`${plan.action} confirmed`, {
          id: toastId,
          description: getExplorerUrl(`/tx/${signature}`),
        });
        await invalidateLotteryCaches(mutate, plan.invalidate ?? []);
        return signature;
      } catch (err) {
        toast.error(plan.action, {
          id: toastId,
          description: parseTransactionError(err),
        });
        markErrorAsToastShown(err);
        throw err;
      } finally {
        setIsSending(false);
      }
    },
    [cluster, getExplorerUrl, mutate, signer, txClient]
  );

  return { send, isSending };
}
