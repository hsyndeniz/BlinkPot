"use client";

import { useCallback } from "react";
import { generateKeyPairSigner } from "@solana/kit";
import { getInitTrophyCollectionInstructionAsync } from "../../../generated/lottery";
import { useActionTrigger, useLotteryActionContext } from "./_helpers";

/**
 * Bootstrap the soulbound trophy collection. One-time admin action: creates
 * the MPL Core collection (with `PermanentFreezeDelegate { frozen: true,
 * authority: None }`), pins its address on `Config.trophy_collection`, and
 * makes the lottery program PDA the update authority so only `claim_winnings`
 * can mint trophies into it.
 */
export function useInitTrophyCollection() {
  const ctx = useLotteryActionContext();

  const fn = useCallback(
    async (input: { name: string; uri: string }) => {
      const signer = ctx.requireSigner();
      // Fresh keypair for the new collection account — Core uses a single-
      // account-per-asset model, so the address IS this keypair's pubkey.
      const collection = await generateKeyPairSigner();

      const instruction = await getInitTrophyCollectionInstructionAsync({
        admin: signer,
        collection,
        name: input.name,
        uri: input.uri,
      });

      return ctx.send({
        action: "Initialize trophy collection",
        instructions: [instruction],
        expectedStateChange:
          "Create MPL Core collection with PermanentFreezeDelegate plugin and pin its address on Config.",
        touchedAccounts: [
          { label: "collection", address: collection.address },
        ],
      });
    },
    [ctx]
  );

  return useActionTrigger(fn);
}
