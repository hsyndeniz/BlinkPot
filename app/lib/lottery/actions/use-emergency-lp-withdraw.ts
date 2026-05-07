"use client";

import { useCallback } from "react";
import { getEmergencyLpWithdrawInstructionAsync } from "../../../generated/lottery";
import { findAta, getCreateAtaInstruction } from "../tokens";
import { useActionTrigger, useLotteryActionContext } from "./_helpers";

export function useEmergencyLpWithdraw() {
  const ctx = useLotteryActionContext();

  const fn = useCallback(async () => {
    const signer = ctx.requireSigner();
    const config = ctx.requireConfig();
    const ata = await findAta(signer.address, config.paymentMint);
    const createAta = await getCreateAtaInstruction({
      payer: signer,
      owner: signer.address,
      mint: config.paymentMint,
    });
    const instruction = await getEmergencyLpWithdrawInstructionAsync({
      owner: signer,
      paymentMint: config.paymentMint,
      ownerTokenAccount: ata,
    });
    return ctx.send({
      action: "Emergency LP withdraw",
      instructions: [createAta, instruction],
      expectedStateChange:
        "Pay out all LP shares (active + pending) up to lp_principal balance and zero the position.",
    });
  }, [ctx]);

  return useActionTrigger(fn);
}
