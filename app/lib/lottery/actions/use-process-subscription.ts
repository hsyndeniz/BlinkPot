"use client";

import { useCallback } from "react";
import type { Address } from "@solana/kit";
import {
  fetchMaybeBuyerEntry,
  fetchMaybeSubscription,
  type Round,
  type TicketPickArgs,
} from "../../../generated/lottery";
import { useSolanaClient } from "../../solana-client-context";
import { buildProcessSubscriptionInstruction } from "../builders";
import {
  findBuyerEntryPda,
  findReferralPda,
  findSubscriptionPda,
  pdaAddress,
} from "../addresses";
import { useActionTrigger, useLotteryActionContext } from "./_helpers";

export function useProcessSubscription() {
  const ctx = useLotteryActionContext();
  const client = useSolanaClient();

  const fn = useCallback(
    async (input: {
      owner: Address;
      round: { address: Address; data: Round };
      picks: TicketPickArgs[];
    }) => {
      const keeper = ctx.requireSigner();
      const config = ctx.requireConfig();

      // Fetch subscription to derive referrer chain.
      const subPda = pdaAddress(
        await findSubscriptionPda({ owner: input.owner })
      );
      const sub = await fetchMaybeSubscription(client.rpc, subPda, {
        commitment: "confirmed",
      });
      if (!sub.exists) throw new Error("Subscription does not exist.");
      if (!sub.data.active) throw new Error("Subscription is inactive.");

      let referrerAccount: Address | undefined;
      let parentReferrerAccount: Address | undefined;
      if (sub.data.hasReferrer) {
        referrerAccount = pdaAddress(
          await findReferralPda({ referrer: sub.data.referrer })
        );
        const referrer = await client.rpc
          .getAccountInfo(referrerAccount, { commitment: "confirmed" })
          .send();
        if (!referrer.value)
          throw new Error("Subscription referrer PDA does not exist.");
      }
      // Lazy parent lookup — relies on builder accepting optional input
      // (matches the buy_tickets path).

      // Derive first ticket index from the buyer entry PDA for this round.
      const buyerEntryPda = pdaAddress(
        await findBuyerEntryPda({
          roundId: input.round.data.roundId,
          buyer: input.owner,
        })
      );
      const buyerEntry = await fetchMaybeBuyerEntry(
        client.rpc,
        buyerEntryPda,
        { commitment: "confirmed" }
      );
      const firstTicketIndex = buyerEntry.exists
        ? buyerEntry.data.ticketCount
        : 0n;

      const built = await buildProcessSubscriptionInstruction({
        keeper,
        owner: input.owner,
        round: input.round.address,
        roundId: input.round.data.roundId,
        paymentMint: config.paymentMint,
        picks: input.picks,
        firstTicketIndex,
        referrerAccount,
        parentReferrerAccount,
      });

      return ctx.send({
        action: "Process subscription",
        instructions: [built.instruction],
        expectedStateChange: `${input.picks.length} ticket(s) minted from subscription escrow on round #${input.round.data.roundId.toString()}.`,
      });
    },
    [ctx, client]
  );

  return useActionTrigger(fn);
}
