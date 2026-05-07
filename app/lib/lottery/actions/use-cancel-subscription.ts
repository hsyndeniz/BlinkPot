"use client";

import { useCallback } from "react";
import { getCancelSubscriptionInstructionAsync } from "../../../generated/lottery";
import { findAta, getCreateAtaInstruction } from "../tokens";
import { useActionTrigger, useLotteryActionContext } from "./_helpers";

export function useCancelSubscription() {
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
    const instruction = await getCancelSubscriptionInstructionAsync({
      owner: signer,
      paymentMint: config.paymentMint,
      ownerTokenAccount: ata,
    });
    return ctx.send({
      action: "Cancel subscription",
      instructions: [createAta, instruction],
      expectedStateChange:
        "Refund escrow_balance to the owner ATA and deactivate the subscription.",
    });
  }, [ctx]);

  return useActionTrigger(fn);
}
