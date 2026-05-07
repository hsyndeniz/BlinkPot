"use client";

import { useCallback } from "react";
import { getClaimReferralFeesInstructionAsync } from "../../../generated/lottery";
import { findAta, getCreateAtaInstruction } from "../tokens";
import { useActionTrigger, useLotteryActionContext } from "./_helpers";

export function useClaimReferralFees() {
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
    const instruction = await getClaimReferralFeesInstructionAsync({
      referrer: signer,
      paymentMint: config.paymentMint,
      referrerTokenAccount: ata,
    });
    return ctx.send({
      action: "Claim referral fees",
      instructions: [createAta, instruction],
      expectedStateChange:
        "Transfer accrued referral fees to the referrer's ATA and reset accrued to 0.",
    });
  }, [ctx]);

  return useActionTrigger(fn);
}
