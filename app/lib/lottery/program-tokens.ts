"use client";

import useSWR from "swr";
import type { Address } from "@solana/kit";
import { useCluster } from "../../components/cluster-context";
import {
  findLpPrincipalPda,
  findPrizeVaultPda,
  findSubEscrowPda,
  pdaAddress,
} from "./addresses";

export type ProgramTokenAddresses = {
  prizeVault: Address;
  lpPrincipal: Address;
  subEscrow?: Address;
};

export function useProgramTokenAddresses(
  paymentMint?: Address,
  owner?: Address
) {
  const { cluster } = useCluster();

  return useSWR(
    paymentMint
      ? ([
          "lottery",
          "pdas",
          "programTokens",
          cluster,
          paymentMint,
          owner ?? "",
        ] as const)
      : null,
    async ([, , , , mint, wallet]): Promise<ProgramTokenAddresses> => {
      const [prizeVault, lpPrincipal] = await Promise.all([
        findPrizeVaultPda({ paymentMint: mint }).then(pdaAddress),
        findLpPrincipalPda({ paymentMint: mint }).then(pdaAddress),
      ]);
      const subEscrow = wallet
        ? await findSubEscrowPda({
            owner: wallet as Address,
            paymentMint: mint,
          }).then(pdaAddress)
        : undefined;
      return { prizeVault, lpPrincipal, subEscrow };
    },
    { revalidateOnFocus: false }
  );
}
