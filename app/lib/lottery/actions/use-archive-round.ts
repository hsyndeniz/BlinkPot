"use client";

import { useCallback } from "react";
import type { Address } from "@solana/kit";
import { getArchiveRoundInstructionAsync } from "../../../generated/lottery";
import { useActionTrigger, useLotteryActionContext } from "./_helpers";

export function useArchiveRound() {
  const ctx = useLotteryActionContext();

  const fn = useCallback(
    async (input: { round: Address; roundId: bigint }) => {
      const signer = ctx.requireSigner();
      const config = ctx.requireConfig();
      const instruction = await getArchiveRoundInstructionAsync({
        admin: signer,
        round: input.round,
        paymentMint: config.paymentMint,
      });
      return ctx.send({
        action: "Archive round",
        instructions: [instruction],
        expectedStateChange: `Archive round #${input.roundId.toString()} and route leftover prize budget per untaken_tier_destination.`,
      });
    },
    [ctx]
  );

  return useActionTrigger(fn);
}
