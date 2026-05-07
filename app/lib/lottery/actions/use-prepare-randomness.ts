"use client";

import { useCallback } from "react";
import type { Address } from "@solana/kit";
import { useCluster } from "../../../components/cluster-context";
import { buildCreateRandomnessInstruction } from "../randomness";
import { useActionTrigger, useLotteryActionContext } from "./_helpers";

export type PrepareRandomnessResult = {
  signature: string | undefined;
  randomnessAccount: Address;
};

export function usePrepareRandomness() {
  const ctx = useLotteryActionContext();
  const { cluster } = useCluster();

  const fn = useCallback(async (): Promise<PrepareRandomnessResult> => {
    const signer = ctx.requireSigner();
    if (cluster !== "devnet") {
      throw new Error(
        "Switchboard randomness setup is supported only on devnet in this console."
      );
    }
    const built = await buildCreateRandomnessInstruction({
      cluster,
      payer: signer.address,
    });
    const signature = await ctx.send({
      action: "Prepare randomness",
      instructions: [built.instruction],
      expectedStateChange:
        "Create a fresh Switchboard randomness account for the round.",
    });
    return { signature, randomnessAccount: built.randomnessAccount };
  }, [ctx, cluster]);

  return useActionTrigger(fn);
}
