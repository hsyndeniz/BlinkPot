"use client";

import { useCallback } from "react";
import {
  fetchMaybeLpPosition,
  getLpFinalizeWithdrawInstructionAsync,
} from "../../../generated/lottery";
import { useSolanaClient } from "../../solana-client-context";
import { findPositionPda, findRoundPda, pdaAddress } from "../addresses";
import { findAta, getCreateAtaInstruction } from "../tokens";
import { useActionTrigger, useLotteryActionContext } from "./_helpers";

export function useLpFinalizeWithdraw() {
  const ctx = useLotteryActionContext();
  const client = useSolanaClient();

  const fn = useCallback(async () => {
    const signer = ctx.requireSigner();
    const config = ctx.requireConfig();

    // Fetch LpPosition to derive the pending_withdraw_round PDA. The program
    // re-derives this PDA via seeds = [ROUND_SEED, &position.pending_withdraw_round.to_le_bytes()]
    // so we have to pass the matching round account.
    const positionPda = pdaAddress(
      await findPositionPda({ owner: signer.address })
    );
    const position = await fetchMaybeLpPosition(client.rpc, positionPda, {
      commitment: "confirmed",
    });
    if (!position.exists) throw new Error("LP position does not exist.");
    if (position.data.pendingWithdrawShares === 0n) {
      throw new Error("No pending LP withdrawal to finalize.");
    }

    const pendingRound = pdaAddress(
      await findRoundPda(position.data.pendingWithdrawRound)
    );
    const ata = await findAta(signer.address, config.paymentMint);
    const createAta = await getCreateAtaInstruction({
      payer: signer,
      owner: signer.address,
      mint: config.paymentMint,
    });

    const instruction = await getLpFinalizeWithdrawInstructionAsync({
      owner: signer,
      pendingRound,
      paymentMint: config.paymentMint,
      ownerTokenAccount: ata,
    });
    return ctx.send({
      action: "Finalize LP withdraw",
      instructions: [createAta, instruction],
      expectedStateChange:
        "Burn pending shares and transfer assets to the LP's wallet.",
    });
  }, [ctx, client]);

  return useActionTrigger(fn);
}
