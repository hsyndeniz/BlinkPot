"use client";

import { useCallback } from "react";
import type { Address } from "@solana/kit";
import {
  type Round,
  type TicketPickArgs,
} from "../../../generated/lottery";
import { buildBuyTicketsInstruction } from "../builders";
import { findAta, getCreateAtaInstruction } from "../tokens";
import { useActionTrigger, useLotteryActionContext, useResolveReferrerChain } from "./_helpers";

export function useBuyTickets() {
  const ctx = useLotteryActionContext();
  const resolveReferrer = useResolveReferrerChain();

  const fn = useCallback(
    async (input: {
      round: { address: Address; data: Round };
      picks: TicketPickArgs[];
      firstTicketIndex: bigint;
      referrer?: Address;
    }) => {
      const signer = ctx.requireSigner();
      const config = ctx.requireConfig();
      if (input.picks.length === 0)
        throw new Error("Pick at least one ticket.");

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

      const built = await buildBuyTicketsInstruction({
        buyer: signer,
        round: input.round.address,
        roundId: input.round.data.roundId,
        paymentMint: config.paymentMint,
        buyerTokenAccount: ata,
        picks: input.picks,
        firstTicketIndex: input.firstTicketIndex,
        referrer: referrerChain.referrer,
        referrerAccount: referrerChain.referrerAccount,
        parentReferrerAccount: referrerChain.parentReferrerAccount,
      });

      const totalCost =
        input.round.data.ticketPrice * BigInt(input.picks.length);

      return ctx.send({
        action: "Buy tickets",
        instructions: [createAta, built.instruction],
        expectedStateChange: `${input.picks.length} ticket(s) created on round #${input.round.data.roundId.toString()}.`,
        touchedAccounts: [
          { label: "round", address: input.round.address },
          { label: "buyer entry", address: built.buyerEntry },
        ],
        // For preflight summary
        tokenAmount: totalCost.toString(),
      });
    },
    [ctx, resolveReferrer]
  );

  return useActionTrigger(fn);
}
