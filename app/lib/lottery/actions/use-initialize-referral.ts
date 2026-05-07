"use client";

import { useCallback } from "react";
import type { Address } from "@solana/kit";
import { getInitializeReferralInstructionAsync } from "../../../generated/lottery";
import { findReferralPda, pdaAddress } from "../addresses";
import { useActionTrigger, useLotteryActionContext } from "./_helpers";

const DEFAULT_PUBKEY = "11111111111111111111111111111111" as Address;

export function useInitializeReferral() {
  const ctx = useLotteryActionContext();

  const fn = useCallback(
    async (input: { parentReferrer?: Address }) => {
      const signer = ctx.requireSigner();
      if (input.parentReferrer && input.parentReferrer === signer.address) {
        throw new Error("Parent referrer cannot be your own wallet.");
      }
      const parentReferral = input.parentReferrer
        ? pdaAddress(
            await findReferralPda({ referrer: input.parentReferrer })
          )
        : undefined;
      const instruction = await getInitializeReferralInstructionAsync({
        referrer: signer,
        parentReferral,
        parentReferrer: input.parentReferrer ?? DEFAULT_PUBKEY,
      });
      return ctx.send({
        action: "Initialize referral",
        instructions: [instruction],
        expectedStateChange: "Create your Referral PDA.",
      });
    },
    [ctx]
  );

  return useActionTrigger(fn);
}
