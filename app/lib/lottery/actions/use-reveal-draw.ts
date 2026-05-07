"use client";

import { useCallback } from "react";
import type { Address } from "@solana/kit";
import { useCluster } from "../../../components/cluster-context";
import { getRevealDrawInstructionAsync } from "../../../generated/lottery";
import { buildSwitchboardRevealInstruction } from "../randomness";
import { useActionTrigger, useLotteryActionContext } from "./_helpers";

export function useRevealDraw() {
  const ctx = useLotteryActionContext();
  const { cluster } = useCluster();

  const fn = useCallback(
    async (input: { round: Address; randomnessAccount: Address }) => {
      const signer = ctx.requireSigner();
      const switchboardIx = await buildSwitchboardRevealInstruction({
        cluster,
        randomnessAccount: input.randomnessAccount,
        payer: signer.address,
      });
      const lotteryIx = await getRevealDrawInstructionAsync({
        trigger: signer,
        round: input.round,
        randomnessAccount: input.randomnessAccount,
      });
      return ctx.send({
        action: "Reveal draw",
        instructions: [switchboardIx, lotteryIx],
        expectedStateChange:
          "Winning balls are recorded and the round enters Claimable.",
      });
    },
    [ctx, cluster]
  );

  return useActionTrigger(fn);
}
