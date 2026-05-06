"use client";

import { useEffect, useMemo } from "react";
import useSWR from "swr";
import {
  fetchMaybeMint,
  fetchMaybeToken,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  TOKEN_PROGRAM_ADDRESS,
  type Mint,
  type Token,
} from "@solana-program/token";
import type {
  Account,
  Address,
  Instruction,
  MaybeAccount,
  ReadonlyUint8Array,
  TransactionSigner,
} from "@solana/kit";
import { useCluster } from "../../components/cluster-context";
import { useSolanaClient } from "../solana-client-context";
import { pdaAddress } from "./addresses";

export const SPL_TOKEN_PROGRAM_ID = TOKEN_PROGRAM_ADDRESS;

export async function findAta(owner: Address, mint: Address): Promise<Address> {
  return pdaAddress(
    await findAssociatedTokenPda({
      owner,
      mint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  );
}

export async function getCreateAtaInstruction(input: {
  payer: TransactionSigner;
  owner: Address;
  mint: Address;
}): Promise<Instruction> {
  return getCreateAssociatedTokenIdempotentInstructionAsync({
    payer: input.payer,
    owner: input.owner,
    mint: input.mint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
}

export async function getTransferInstruction(input: {
  source: Address;
  destination: Address;
  owner: TransactionSigner;
  amount: bigint;
}): Promise<Instruction> {
  return {
    programAddress: TOKEN_PROGRAM_ADDRESS,
    accounts: [
      { address: input.source, role: 2 }, // source (writable)
      { address: input.destination, role: 2 }, // destination (writable)
      { address: input.owner.address, role: 1 }, // owner/authority (signer)
    ],
    data: new Uint8Array([
      3, // Transfer instruction discriminator
      ...new Uint8Array(new BigUint64Array([input.amount]).buffer),
    ]) as ReadonlyUint8Array,
  };
}

export function parseTokenAmount(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  if (!trimmed) return 0n;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("Enter a positive decimal amount.");
  }

  const [wholeRaw, fractionalRaw = ""] = trimmed.split(".");
  const whole = BigInt(wholeRaw || "0");
  const fractional =
    decimals === 0
      ? 0n
      : BigInt((fractionalRaw + "0".repeat(decimals)).slice(0, decimals));
  return whole * 10n ** BigInt(decimals) + fractional;
}

export function formatTokenAmount(
  amount: bigint | number | undefined | null,
  decimals: number,
  options: { maxDecimals?: number } = {}
): string {
  if (amount == null) return "-";
  const value = BigInt(amount);
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = value % scale;
  const maxDecimals = Math.min(options.maxDecimals ?? decimals, decimals);

  if (decimals === 0 || maxDecimals === 0) return whole.toString();

  const fractional = fraction
    .toString()
    .padStart(decimals, "0")
    .slice(0, maxDecimals)
    .replace(/0+$/, "");

  return fractional ? `${whole}.${fractional}` : whole.toString();
}

/**
 * Best-effort symbol lookup for a payment mint. The lottery program is decimals-
 * and mint-agnostic, so the UI can't hard-code "USDC" — we map well-known mainnet
 * stablecoin mints by address and fall back to a generic "tokens" label for any
 * other mint (custom test mints, devnet stables, etc.). If you deploy with a
 * less-common stable, add its mint here.
 */
const KNOWN_TOKEN_SYMBOLS: Readonly<Record<string, string>> = {
  // Mainnet stables
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
  "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo": "PYUSD",
  USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA: "USDS",
  HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr: "EURC",
  // Devnet USDC (Solana foundation's faucet mint)
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU": "USDC",
};

const FALLBACK_SYMBOL = "tokens";

export function tokenSymbolFor(mint?: Address | string): string {
  if (!mint) return FALLBACK_SYMBOL;
  return KNOWN_TOKEN_SYMBOLS[mint as string] ?? FALLBACK_SYMBOL;
}

export function useTokenSymbol(mint?: Address): string {
  return tokenSymbolFor(mint);
}

export function useMint(mint?: Address) {
  const { cluster } = useCluster();
  const client = useSolanaClient();

  const result = useSWR(
    mint ? (["lottery", "mint", cluster, mint] as const) : null,
    async ([, , , mintAddress]) =>
      fetchMaybeMint(client.rpc, mintAddress, { commitment: "confirmed" }),
    { revalidateOnFocus: true }
  );

  return {
    ...result,
    account: result.data as MaybeAccount<Mint> | undefined,
    mint: result.data?.exists ? (result.data as Account<Mint>).data : undefined,
    decimals: result.data?.exists ? result.data.data.decimals : 6,
  };
}

export function useTokenAccount(owner?: Address, mint?: Address) {
  const { cluster } = useCluster();
  const client = useSolanaClient();
  const mintInfo = useMint(mint);

  const ataKey = useSWR(
    owner && mint ? (["lottery", "ata", cluster, owner, mint] as const) : null,
    async ([, , , wallet, tokenMint]) => findAta(wallet, tokenMint),
    { revalidateOnFocus: false }
  );

  const token = useSWR(
    ataKey.data ? (["lottery", "token", cluster, ataKey.data] as const) : null,
    async ([, , , ata]) =>
      fetchMaybeToken(client.rpc, ata, { commitment: "confirmed" }),
    { revalidateOnFocus: true }
  );

  useEffect(() => {
    if (!ataKey.data) return;
    const abortController = new AbortController();

    const subscribe = async () => {
      try {
        const notifications = await client.rpcSubscriptions
          .accountNotifications(ataKey.data!, { commitment: "confirmed" })
          .subscribe({ abortSignal: abortController.signal });

        for await (const notification of notifications) {
          if (!notification.value.data) {
            token.mutate();
          } else {
            token.mutate();
          }
        }
      } catch {
        // SWR polling/focus revalidation remains the fallback.
      }
    };

    void subscribe();
    return () => abortController.abort();
  }, [ataKey.data, client, token]);

  return useMemo(
    () => ({
      ata: ataKey.data,
      ataError: ataKey.error,
      tokenAccount: token.data as MaybeAccount<Token> | undefined,
      token: token.data?.exists
        ? (token.data as Account<Token>).data
        : undefined,
      amount: token.data?.exists ? token.data.data.amount : 0n,
      decimals: mintInfo.decimals,
      mint: mintInfo.mint,
      isLoading: ataKey.isLoading || token.isLoading || mintInfo.isLoading,
      error: ataKey.error ?? token.error ?? mintInfo.error,
      mutate: token.mutate,
    }),
    [ataKey, token, mintInfo]
  );
}

export function useTokenAccountAddress(address?: Address, mint?: Address) {
  const { cluster } = useCluster();
  const client = useSolanaClient();
  const mintInfo = useMint(mint);

  const token = useSWR(
    address ? (["lottery", "token", cluster, address] as const) : null,
    async ([, , , tokenAddress]) =>
      fetchMaybeToken(client.rpc, tokenAddress, { commitment: "confirmed" }),
    { revalidateOnFocus: true }
  );

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
          token.mutate();
        }
      } catch {
        // SWR polling/focus revalidation remains the fallback.
      }
    };

    void subscribe();
    return () => abortController.abort();
  }, [address, client, token]);

  return useMemo(
    () => ({
      tokenAccount: token.data as MaybeAccount<Token> | undefined,
      token: token.data?.exists
        ? (token.data as Account<Token>).data
        : undefined,
      amount: token.data?.exists ? token.data.data.amount : 0n,
      decimals: mintInfo.decimals,
      mint: mintInfo.mint,
      isLoading: token.isLoading || mintInfo.isLoading,
      error: token.error ?? mintInfo.error,
      mutate: token.mutate,
    }),
    [token, mintInfo]
  );
}
