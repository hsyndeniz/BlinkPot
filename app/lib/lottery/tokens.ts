"use client";

import { useMemo } from "react";
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
  Address,
  Instruction,
  ReadonlyUint8Array,
  TransactionSigner,
} from "@solana/kit";
import { useCluster } from "../../components/cluster-context";
import { useSolanaClient } from "../solana-client-context";
import { pdaAddress } from "./addresses";
import { useAccountSubscription } from "./_account-subscription";
import { exists } from "./_account-query";

export const SPL_TOKEN_PROGRAM_ID = TOKEN_PROGRAM_ADDRESS;

// ─── ATA derivation + instruction helpers ──────────────────────────────────

export async function findAta(owner: Address, mint: Address): Promise<Address> {
  return pdaAddress(
    await findAssociatedTokenPda({
      owner,
      mint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  );
}

export function getCreateAtaInstruction(input: {
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

const SPL_TRANSFER_DISCRIMINATOR = 3;

export function getTransferInstruction(input: {
  source: Address;
  destination: Address;
  owner: TransactionSigner;
  amount: bigint;
}): Instruction {
  return {
    programAddress: TOKEN_PROGRAM_ADDRESS,
    accounts: [
      { address: input.source, role: 2 }, // writable
      { address: input.destination, role: 2 }, // writable
      { address: input.owner.address, role: 1 }, // signer
    ],
    data: new Uint8Array([
      SPL_TRANSFER_DISCRIMINATOR,
      ...new Uint8Array(new BigUint64Array([input.amount]).buffer),
    ]) as ReadonlyUint8Array,
  };
}

// ─── decimal formatting ────────────────────────────────────────────────────

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

// ─── symbol lookup ─────────────────────────────────────────────────────────

/**
 * Best-effort symbol lookup for a payment mint. The lottery program is decimals-
 * and mint-agnostic, so the UI can't hard-code "USDC" — we map well-known mainnet
 * stablecoin mints by address and fall back to a generic "tokens" label for any
 * other mint (custom test mints, devnet stables, etc.). If you deploy with a
 * less-common stable, add its mint here.
 */
const KNOWN_TOKEN_SYMBOLS: Readonly<Record<string, string>> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
  "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo": "PYUSD",
  USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA: "USDS",
  HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr: "EURC",
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU": "USDC",
};

const FALLBACK_SYMBOL = "USDC";

export function tokenSymbolFor(mint?: Address | string): string {
  if (!mint) return FALLBACK_SYMBOL;
  return KNOWN_TOKEN_SYMBOLS[mint as string] ?? FALLBACK_SYMBOL;
}

export function useTokenSymbol(mint?: Address): string {
  return tokenSymbolFor(mint);
}

// ─── mint + token-account hooks ────────────────────────────────────────────

const DEFAULT_DECIMALS = 6;

export function useMint(mint?: Address) {
  const { cluster } = useCluster();
  const client = useSolanaClient();

  const result = useSWR(
    mint ? (["lottery", "mint", cluster, mint] as const) : null,
    async ([, , , addr]) =>
      fetchMaybeMint(client.rpc, addr, { commitment: "confirmed" }),
    { revalidateOnFocus: true }
  );

  const acc = result.data;
  const has = exists(acc);
  return {
    ...result,
    account: acc,
    mint: has ? acc.data : undefined,
    decimals: has ? acc.data.decimals : DEFAULT_DECIMALS,
  };
}

/** Internal: SWR-driven fetch + WebSocket subscription for a single token account. */
function useTokenAccountAt(address: Address | undefined) {
  const { cluster } = useCluster();
  const client = useSolanaClient();

  const result = useSWR(
    address ? (["lottery", "token", cluster, address] as const) : null,
    async ([, , , addr]) =>
      fetchMaybeToken(client.rpc, addr, { commitment: "confirmed" }),
    { revalidateOnFocus: true }
  );

  useAccountSubscription(address, () => result.mutate());

  const acc = result.data;
  const has = exists(acc);
  return {
    swr: result,
    tokenAccount: acc,
    token: has ? acc.data : undefined,
    amount: has ? acc.data.amount : 0n,
  };
}

export function useTokenAccount(owner?: Address, mint?: Address) {
  const { cluster } = useCluster();
  const mintInfo = useMint(mint);

  const ataKey = useSWR(
    owner && mint ? (["lottery", "ata", cluster, owner, mint] as const) : null,
    async ([, , , wallet, tokenMint]) => findAta(wallet, tokenMint),
    { revalidateOnFocus: false }
  );

  const tokenInfo = useTokenAccountAt(ataKey.data);

  return useMemo(
    () => ({
      ata: ataKey.data,
      ataError: ataKey.error,
      tokenAccount: tokenInfo.tokenAccount,
      token: tokenInfo.token,
      amount: tokenInfo.amount,
      decimals: mintInfo.decimals,
      mint: mintInfo.mint,
      isLoading:
        ataKey.isLoading || tokenInfo.swr.isLoading || mintInfo.isLoading,
      error: ataKey.error ?? tokenInfo.swr.error ?? mintInfo.error,
      mutate: tokenInfo.swr.mutate,
    }),
    [ataKey, tokenInfo, mintInfo]
  );
}

export function useTokenAccountAddress(address?: Address, mint?: Address) {
  const mintInfo = useMint(mint);
  const tokenInfo = useTokenAccountAt(address);

  return useMemo(
    () => ({
      tokenAccount: tokenInfo.tokenAccount,
      token: tokenInfo.token,
      amount: tokenInfo.amount,
      decimals: mintInfo.decimals,
      mint: mintInfo.mint,
      isLoading: tokenInfo.swr.isLoading || mintInfo.isLoading,
      error: tokenInfo.swr.error ?? mintInfo.error,
      mutate: tokenInfo.swr.mutate,
    }),
    [tokenInfo, mintInfo]
  );
}
