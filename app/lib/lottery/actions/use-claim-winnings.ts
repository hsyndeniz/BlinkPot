"use client";

import { useCallback } from "react";
import type { Address } from "@solana/kit";
import {
  getClaimWinningsInstructionAsync,
  type Ticket,
} from "../../../generated/lottery";
import {
  findPickCounterPda,
  findReferralPda,
  pdaAddress,
} from "../addresses";
import { findAta, getCreateAtaInstruction } from "../tokens";
import { useActionTrigger, useLotteryActionContext } from "./_helpers";

export function useClaimWinnings() {
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

      const pickCounter = pdaAddress(
        await findPickCounterPda({
          roundId: input.ticket.data.roundId,
          normals: input.ticket.data.normals,
          bonusball: input.ticket.data.bonusball,
        })
      );

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

      const instruction = await getClaimWinningsInstructionAsync({
        owner: signer,
        round: input.round,
        ticket: input.ticket.address,
        pickCounter,
        paymentMint: config.paymentMint,
        winnerTokenAccount: ata,
        referrerAccount,
        parentReferrerAccount,
      });

      return ctx.send({
        action: "Claim winnings",
        instructions: [createAta, instruction],
        expectedStateChange:
          "Ticket marked claimed and payout transferred to winner ATA.",
        touchedAccounts: [
          { label: "round", address: input.round },
          { label: "ticket", address: input.ticket.address },
          { label: "winner ATA", address: ata },
        ],
      });
    },
    [ctx]
  );

  return useActionTrigger(fn);
}
