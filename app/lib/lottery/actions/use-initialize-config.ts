"use client";

import { useCallback } from "react";
import type { Address } from "@solana/kit";
import {
  getInitializeConfigInstructionAsync,
  type ConfigParamsArgs,
} from "../../../generated/lottery";
import { useActionTrigger, useLotteryActionContext } from "./_helpers";

export function useInitializeConfig() {
  const ctx = useLotteryActionContext();

  const fn = useCallback(
    async (input: { paymentMint: Address; params: ConfigParamsArgs }) => {
      const signer = ctx.requireSigner();
      const instruction = await getInitializeConfigInstructionAsync({
        admin: signer,
        paymentMint: input.paymentMint,
        params: input.params,
      });
      return ctx.send({
        action: "Initialize config",
        instructions: [instruction],
        expectedStateChange:
          "Create Config, RoundCounter, LpVault PDAs and prize/LP token vaults.",
      });
    },
    [ctx]
  );

  return useActionTrigger(fn);
}
