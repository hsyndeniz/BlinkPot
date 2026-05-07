"use client";

import { useCallback } from "react";
import type { Address } from "@solana/kit";
import {
  getEmergencyRefundTicketInstructionAsync,
  type Ticket,
} from "../../../generated/lottery";
import { findReferralPda, pdaAddress } from "../addresses";
import { findAta, getCreateAtaInstruction } from "../tokens";
import { useActionTrigger, useLotteryActionContext } from "./_helpers";

export function useEmergencyRefundTicket() {
  const ctx = useLotteryActionContext();

  const fn = useCallback(
    async (input: {
      round: Address;
      ticket: { address: Address; data: Ticket };
    }) => {
      const signer = ctx.requireSigner();
      const config = ctx.requireConfig();

      const ata = await findAta(signer.address, config.paymentMint);
      const createAta = await getCreateAtaInstruction({
        payer: signer,
        owner: signer.address,
        mint: config.paymentMint,
      });

      const referrerAccount = input.ticket.data.hasReferrer
        ? pdaAddress(
            await findReferralPda({
              referrer: input.ticket.data.referrer,
            })
          )
        : undefined;
      const parentReferrerAccount = input.ticket.data.hasParentReferrer
        ? pdaAddress(
            await findReferralPda({
              referrer: input.ticket.data.parentReferrer,
            })
          )
        : undefined;

      const instruction = await getEmergencyRefundTicketInstructionAsync({
        owner: signer,
        round: input.round,
        ticket: input.ticket.address,
        paymentMint: config.paymentMint,
        ownerTokenAccount: ata,
        referrerAccount,
        parentReferrerAccount,
      });

      return ctx.send({
        action: "Emergency refund ticket",
        instructions: [createAta, instruction],
        expectedStateChange:
          "Refund the ticket — prize vault first, lp principal as fallback.",
      });
    },
    [ctx]
  );

  return useActionTrigger(fn);
}
