"use client";

import { useCallback } from "react";
import type { Address } from "@solana/kit";
import { getSubscribeDailyInstructionAsync } from "../../../generated/lottery";
import { findAta, getCreateAtaInstruction } from "../tokens";
import {
  useActionTrigger,
  useLotteryActionContext,
  useResolveReferrerChain,
} from "./_helpers";

export function useSubscribeDaily() {
  const ctx = useLotteryActionContext();
  const resolveReferrer = useResolveReferrerChain();

  const fn = useCallback(
    async (input: {
      dailyTicketCount: number;
      days: number;
      referrer?: Address;
    }) => {
      const signer = ctx.requireSigner();
      const config = ctx.requireConfig();

      if (input.dailyTicketCount < 1 || input.dailyTicketCount > 20)
        throw new Error("Daily ticket count must be between 1 and 20.");
      if (input.days < 1 || input.days > 365)
        throw new Error("Days must be between 1 and 365.");

      const ata = await findAta(signer.address, config.paymentMint);
      const createAta = await getCreateAtaInstruction({
        payer: signer,
        owner: signer.address,
        mint: config.paymentMint,
      });

      const referrerChain = await resolveReferrer({
        referrer: input.referrer,
        buyer: signer.address,
      });

      const instruction = await getSubscribeDailyInstructionAsync({
        owner: signer,
        paymentMint: config.paymentMint,
        ownerTokenAccount: ata,
        referrerAccount: referrerChain.referrerAccount,
        dailyTicketCount: input.dailyTicketCount,
        days: input.days,
        referrer: input.referrer ?? null,
      });

      return ctx.send({
        action: "Create subscription",
        instructions: [createAta, instruction],
        expectedStateChange:
          "Subscription PDA created and escrow funded for the requested days.",
      });
    },
    [ctx, resolveReferrer]
  );

  return useActionTrigger(fn);
}
