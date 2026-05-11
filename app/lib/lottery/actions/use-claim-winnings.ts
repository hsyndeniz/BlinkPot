"use client";

import { useCallback } from "react";
import { address as parseAddress, generateKeyPairSigner } from "@solana/kit";
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

/** MPL Core program ID (same on mainnet + devnet). */
const MPL_CORE_PROGRAM_ADDRESS = parseAddress(
  "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d",
);

/** Sentinel for an unset trophy collection (`Pubkey::default()` on-chain). */
const PUBKEY_DEFAULT = parseAddress("11111111111111111111111111111111");

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

      // Trophy mint is gated by `config.trophy_collection != Pubkey::default()`.
      // When set, we must generate a fresh keypair signer for the new asset and
      // include the trophy collection + MPL Core program in the ix accounts.
      const hasTrophyCollection = config.trophyCollection !== PUBKEY_DEFAULT;
      const trophyAsset = hasTrophyCollection
        ? await generateKeyPairSigner()
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
        trophyAsset,
        trophyCollectionAccount: hasTrophyCollection
          ? config.trophyCollection
          : undefined,
        mplCoreProgram: hasTrophyCollection
          ? MPL_CORE_PROGRAM_ADDRESS
          : undefined,
      });

      return ctx.send({
        action: "Claim winnings",
        instructions: [createAta, instruction],
        expectedStateChange: hasTrophyCollection
          ? "Ticket claimed, payout sent, soulbound winner trophy minted."
          : "Ticket marked claimed and payout transferred to winner ATA.",
        touchedAccounts: [
          { label: "round", address: input.round },
          { label: "ticket", address: input.ticket.address },
          { label: "winner ATA", address: ata },
          ...(trophyAsset
            ? [{ label: "trophy", address: trophyAsset.address }]
            : []),
        ],
      });
    },
    [ctx]
  );

  return useActionTrigger(fn);
}
