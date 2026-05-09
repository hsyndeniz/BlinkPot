"use client";

import { useCallback } from "react";
import { getLpInitiateWithdrawInstructionAsync } from "../../../generated/lottery";
import { useActionTrigger, useLotteryActionContext } from "./_helpers";

export function useLpInitiateWithdraw() {
  const ctx = useLotteryActionContext();

  const fn = useCallback(
    async (input: { shares: bigint }) => {
      const signer = ctx.requireSigner();
      if (input.shares <= 0n) throw new Error("Shares must be positive.");
      // Anchor instruction takes a u64 — guard against the actual overflow
      // boundary, not Number.MAX_SAFE_INTEGER (which is ~3 orders of
      // magnitude smaller and rejects legitimate withdrawals).
      const U64_MAX = (1n << 64n) - 1n;
      if (input.shares > U64_MAX) {
        throw new Error(
          "Shares exceed the per-instruction u64 limit. Withdraw in smaller batches."
        );
      }
      const instruction = await getLpInitiateWithdrawInstructionAsync({
        owner: signer,
        shares: input.shares,
      });
      return ctx.send({
        action: "Initiate LP withdraw",
        instructions: [instruction],
        expectedStateChange:
          "Move shares from active to pending; cooldown begins on this round.",
      });
    },
    [ctx]
  );

  return useActionTrigger(fn);
}
