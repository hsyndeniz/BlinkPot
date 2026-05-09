"use client";

import { useCallback, useState } from "react";
import type { Address, TransactionSigner } from "@solana/kit";
import { fetchMaybeReferral, type Config } from "../../../generated/lottery";
import { parseTransactionError } from "../../errors";
import { useSolanaClient } from "../../solana-client-context";
import { useWallet } from "../../wallet/context";
import { useSendLotteryTransaction, type LotteryActionPlan } from "../transactions";
import { useConfig } from "../accounts";
import { findReferralPda, pdaAddress } from "../addresses";

export type ActionTriggerState<TArgs extends unknown[], TResult = void> = {
  trigger: (...args: TArgs) => Promise<TResult>;
  isPending: boolean;
  lastError: string | null;
};

/**
 * Wraps an async action with pending/error state. The inner function is
 * responsible for building instructions and calling the send helper; this
 * hook only handles UI state and error parsing.
 */
export function useActionTrigger<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>
): ActionTriggerState<TArgs, TResult> {
  const [isPending, setIsPending] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const trigger = useCallback(
    async (...args: TArgs) => {
      setLastError(null);
      setIsPending(true);
      try {
        return await fn(...args);
      } catch (err) {
        // Always parse — the `lotteryToastShown` flag only prevents the
        // transaction layer from emitting a duplicate toast; it must not
        // leak the raw error message into UI surfaces (Alerts, etc.).
        setLastError(parseTransactionError(err));
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [fn]
  );

  return { trigger, isPending, lastError };
}

export type LotteryActionContext = {
  signer: TransactionSigner | undefined;
  walletAddress: Address | undefined;
  config: Config | undefined;
  send: (plan: LotteryActionPlan) => Promise<string | undefined>;
  requireSigner: () => TransactionSigner;
  requireConfig: () => Config;
};

export function useLotteryActionContext(): LotteryActionContext {
  const { signer, wallet } = useWallet();
  const walletAddress = signer?.address ?? wallet?.account.address;
  const { config } = useConfig();
  const { send } = useSendLotteryTransaction();

  const requireSigner = useCallback((): TransactionSigner => {
    if (!signer) throw new Error("Connect a wallet first.");
    return signer;
  }, [signer]);

  const requireConfig = useCallback((): Config => {
    if (!config) throw new Error("Lottery config is not initialized.");
    return config;
  }, [config]);

  return {
    signer,
    walletAddress,
    config,
    send,
    requireSigner,
    requireConfig,
  };
}

/**
 * Resolve an optional referrer address into the referral chain accounts
 * required by `buy_tickets` / `subscribe_daily`. Validates self-referral
 * and that the referrer's PDA exists. Returns `undefined` for an empty
 * input — callers that require a referrer should validate beforehand.
 */
export function useResolveReferrerChain() {
  const client = useSolanaClient();

  return useCallback(
    async (input: {
      referrer?: Address;
      buyer?: Address;
    }): Promise<{
      referrer?: Address;
      referrerAccount?: Address;
      parentReferrerAccount?: Address;
    }> => {
      if (!input.referrer) return {};
      if (input.buyer && input.referrer === input.buyer) {
        throw new Error("Referrer cannot be the connected wallet.");
      }
      const referrerAccount = pdaAddress(
        await findReferralPda({ referrer: input.referrer })
      );
      const account = await fetchMaybeReferral(client.rpc, referrerAccount, {
        commitment: "confirmed",
      });
      if (!account.exists) {
        throw new Error(
          "The referrer has not initialized a referral account yet."
        );
      }
      let parentReferrerAccount: Address | undefined;
      if (account.data.hasParent) {
        parentReferrerAccount = pdaAddress(
          await findReferralPda({ referrer: account.data.parentReferrer })
        );
      }
      return {
        referrer: input.referrer,
        referrerAccount,
        parentReferrerAccount,
      };
    },
    [client]
  );
}
