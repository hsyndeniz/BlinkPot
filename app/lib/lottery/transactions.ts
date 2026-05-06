"use client";

import { useCallback, useMemo, useState } from "react";
import { useSWRConfig, type Key } from "swr";
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

function summarize(plan: LotteryActionPlan, cluster: string): string {
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
    for (const account of plan.touchedAccounts.slice(0, 12)) {
      lines.push(`- ${account.label}: ${account.address}`);
    }
    if (plan.touchedAccounts.length > 12) {
      lines.push(`- ... ${plan.touchedAccounts.length - 12} more`);
    }
  }

  return lines.join("\n");
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
          summarize({ ...plan, feePayer: signer.address }, cluster)
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

        await mutate(
          (key: unknown) => Array.isArray(key) && key[0] === "lottery"
        );
        await mutate(
          (key: unknown) => Array.isArray(key) && key[0] === "balance"
        );
        for (const key of plan.invalidate ?? []) {
          await mutate(key);
        }

        return signature;
      } catch (err) {
        toast.error(plan.action, {
          id: toastId,
          description: parseTransactionError(err),
        });
        if (err && typeof err === "object") {
          (err as { lotteryToastShown?: boolean }).lotteryToastShown = true;
        }
        throw err;
      } finally {
        setIsSending(false);
      }
    },
    [cluster, getExplorerUrl, mutate, signer, txClient]
  );

  return { send, isSending };
}
