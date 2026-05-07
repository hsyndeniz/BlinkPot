"use client";

import { useCallback } from "react";
import type { Address } from "@solana/kit";
import { useCluster } from "../../../components/cluster-context";
import { getCommitDrawInstructionAsync } from "../../../generated/lottery";
import { buildSwitchboardCommitInstruction } from "../randomness";
import { useActionTrigger, useLotteryActionContext } from "./_helpers";

export function useCommitDraw() {
  const ctx = useLotteryActionContext();
  const { cluster } = useCluster();

  const fn = useCallback(
    async (input: { round: Address; randomnessAccount: Address }) => {
      const signer = ctx.requireSigner();
      const switchboardIx = await buildSwitchboardCommitInstruction({
        cluster,
        randomnessAccount: input.randomnessAccount,
      });
      const lotteryIx = await getCommitDrawInstructionAsync({
        trigger: signer,
        round: input.round,
        randomnessAccount: input.randomnessAccount,
      });
      return ctx.send({
        action: "Commit draw",
        instructions: [switchboardIx, lotteryIx],
        expectedStateChange:
          "Switchboard records the commit slot and the round transitions to Drawing.",
      });
    },
    [ctx, cluster]
  );

  return useActionTrigger(fn);
}
