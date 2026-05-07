"use client";

import { useCallback } from "react";
import type { Address } from "@solana/kit";
import {
  fetchMaybeRoundCounter,
  getStartRoundInstructionAsync,
} from "../../../generated/lottery";
import { useSolanaClient } from "../../solana-client-context";
import { findRoundCounterPda, findRoundPda, pdaAddress } from "../addresses";
import { useActionTrigger, useLotteryActionContext } from "./_helpers";

export function useStartRound() {
  const ctx = useLotteryActionContext();
  const client = useSolanaClient();
  const SYSTEM_PROGRAM = "11111111111111111111111111111111" as Address;

  const fn = useCallback(
    async (input: {
      ticketPrice?: bigint;
      durationSeconds?: bigint;
      bonusballMax?: number;
      guaranteedPrizePoolOverride?: bigint;
    }) => {
      const signer = ctx.requireSigner();
      const config = ctx.requireConfig();

      const counterPda = pdaAddress(await findRoundCounterPda());
      const counter = await fetchMaybeRoundCounter(client.rpc, counterPda, {
        commitment: "confirmed",
      });
      const currentRoundId = counter.exists ? counter.data.currentRoundId : 0n;
      const previousRound =
        currentRoundId > 0n
          ? pdaAddress(await findRoundPda(currentRoundId))
          : SYSTEM_PROGRAM;
      const newRound = pdaAddress(await findRoundPda(currentRoundId + 1n));

      const instruction = await getStartRoundInstructionAsync({
        starter: signer,
        previousRound,
        round: newRound,
        paymentMint: config.paymentMint,
        ticketPrice: input.ticketPrice ?? 0n,
        durationSeconds: input.durationSeconds ?? 0n,
        bonusballMax: input.bonusballMax ?? 0,
        guaranteedPrizePoolOverride: input.guaranteedPrizePoolOverride ?? 0n,
      });

      return ctx.send({
        action: "Start round",
        instructions: [instruction],
        expectedStateChange: `Open round #${(currentRoundId + 1n).toString()}.`,
      });
    },
    [ctx, client, SYSTEM_PROGRAM]
  );

  return useActionTrigger(fn);
}
