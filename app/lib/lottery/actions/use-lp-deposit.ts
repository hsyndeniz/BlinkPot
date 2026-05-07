"use client";

import { useCallback } from "react";
import { getLpDepositInstructionAsync } from "../../../generated/lottery";
import { findAta, getCreateAtaInstruction } from "../tokens";
import { useActionTrigger, useLotteryActionContext } from "./_helpers";

export function useLpDeposit() {
  const ctx = useLotteryActionContext();

  const fn = useCallback(
    async (input: { amount: bigint }) => {
      const signer = ctx.requireSigner();
      const config = ctx.requireConfig();
      if (input.amount <= 0n) throw new Error("Deposit amount must be positive.");

      const ata = await findAta(signer.address, config.paymentMint);
      const createAta = await getCreateAtaInstruction({
        payer: signer,
        owner: signer.address,
        mint: config.paymentMint,
      });

      const instruction = await getLpDepositInstructionAsync({
        owner: signer,
        paymentMint: config.paymentMint,
        ownerTokenAccount: ata,
        amount: input.amount,
      });
      return ctx.send({
        action: "LP deposit",
        instructions: [createAta, instruction],
        expectedStateChange: "Mint LP shares for the deposited assets.",
      });
    },
    [ctx]
  );

  return useActionTrigger(fn);
}
