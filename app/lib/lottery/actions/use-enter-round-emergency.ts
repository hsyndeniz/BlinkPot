"use client";

import { useCallback } from "react";
import type { Address } from "@solana/kit";
import { getEnterRoundEmergencyInstructionAsync } from "../../../generated/lottery";
import { useActionTrigger, useLotteryActionContext } from "./_helpers";

export function useEnterRoundEmergency() {
  const ctx = useLotteryActionContext();

  const fn = useCallback(
    async (input: { round: Address }) => {
      const signer = ctx.requireSigner();
      const config = ctx.requireConfig();
      const instruction = await getEnterRoundEmergencyInstructionAsync({
        admin: signer,
        round: input.round,
        paymentMint: config.paymentMint,
      });
      return ctx.send({
        action: "Enter round emergency",
        instructions: [instruction],
        expectedStateChange:
          "Move round to Emergency state and refund LP guarantee from prize vault.",
      });
    },
    [ctx]
  );

  return useActionTrigger(fn);
}
