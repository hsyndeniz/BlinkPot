"use client";

import { useCallback } from "react";
import {
  getUpdateConfigInstructionAsync,
  type ConfigParamsArgs,
} from "../../../generated/lottery";
import { useActionTrigger, useLotteryActionContext } from "./_helpers";

export function useUpdateConfig() {
  const ctx = useLotteryActionContext();

  const fn = useCallback(
    async (input: { params: ConfigParamsArgs }) => {
      const signer = ctx.requireSigner();
      const instruction = await getUpdateConfigInstructionAsync({
        admin: signer,
        params: input.params,
      });
      return ctx.send({
        action: "Update config",
        instructions: [instruction],
        expectedStateChange:
          "Apply new ConfigParams to the existing Config PDA.",
      });
    },
    [ctx]
  );

  return useActionTrigger(fn);
}
