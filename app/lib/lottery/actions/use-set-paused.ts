"use client";

import { useCallback } from "react";
import { getSetPausedInstructionAsync } from "../../../generated/lottery";
import { useActionTrigger, useLotteryActionContext } from "./_helpers";

export function useSetPaused() {
  const ctx = useLotteryActionContext();

  const fn = useCallback(
    async (paused: boolean) => {
      const signer = ctx.requireSigner();
      const instruction = await getSetPausedInstructionAsync({
        admin: signer,
        paused,
      });
      return ctx.send({
        action: paused ? "Pause protocol" : "Resume protocol",
        instructions: [instruction],
        expectedStateChange: `Set Config.paused = ${paused}.`,
      });
    },
    [ctx]
  );

  return useActionTrigger(fn);
}
