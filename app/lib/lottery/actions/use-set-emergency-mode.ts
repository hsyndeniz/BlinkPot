"use client";

import { useCallback } from "react";
import { getSetEmergencyModeInstructionAsync } from "../../../generated/lottery";
import { useActionTrigger, useLotteryActionContext } from "./_helpers";

export function useSetEmergencyMode() {
  const ctx = useLotteryActionContext();

  const fn = useCallback(
    async (enabled: boolean) => {
      const signer = ctx.requireSigner();
      const instruction = await getSetEmergencyModeInstructionAsync({
        admin: signer,
        enabled,
      });
      return ctx.send({
        action: enabled ? "Enter emergency mode" : "Exit emergency mode",
        instructions: [instruction],
        expectedStateChange: `Set Config.emergencyMode = ${enabled}.`,
      });
    },
    [ctx]
  );

  return useActionTrigger(fn);
}
