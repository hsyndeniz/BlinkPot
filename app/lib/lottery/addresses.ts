"use client";

import {
  getAddressEncoder,
  getBytesEncoder,
  getProgramDerivedAddress,
  type Address,
  type ProgramDerivedAddress,
} from "@solana/kit";
import {
  findConfigPda,
  findLpAuthorityPda,
  findLpPrincipalPda,
  findLpVaultPda,
  findPositionPda,
  findPrizeVaultAuthorityPda,
  findPrizeVaultPda,
  findReferralPda,
  findRoundCounterPda,
  findSubEscrowPda,
  findSubscriptionPda,
} from "../../generated/lottery";
import { LOTTERY_PROGRAM_ADDRESS } from "../../generated/lottery/programs";

export {
  findConfigPda,
  findLpAuthorityPda,
  findLpPrincipalPda,
  findLpVaultPda,
  findPositionPda,
  findPrizeVaultAuthorityPda,
  findPrizeVaultPda,
  findReferralPda,
  findRoundCounterPda,
  findSubEscrowPda,
  findSubscriptionPda,
};

export const LOTTERY_PROGRAM_ID = LOTTERY_PROGRAM_ADDRESS;

const textEncoder = getBytesEncoder();
const addressEncoder = getAddressEncoder();

export function u64Le(value: bigint | number): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(value), true);
  return out;
}

function seed(value: string) {
  return textEncoder.encode(new TextEncoder().encode(value));
}

export async function findRoundPda(
  roundId: bigint | number,
  config: { programAddress?: Address } = {}
): Promise<ProgramDerivedAddress> {
  return getProgramDerivedAddress({
    programAddress: config.programAddress ?? LOTTERY_PROGRAM_ID,
    seeds: [seed("round"), u64Le(roundId)],
  });
}

export async function findTicketPda(
  seeds: {
    roundId: bigint | number;
    owner: Address;
    ticketIndex: bigint | number;
  },
  config: { programAddress?: Address } = {}
): Promise<ProgramDerivedAddress> {
  return getProgramDerivedAddress({
    programAddress: config.programAddress ?? LOTTERY_PROGRAM_ID,
    seeds: [
      seed("ticket"),
      u64Le(seeds.roundId),
      addressEncoder.encode(seeds.owner),
      u64Le(seeds.ticketIndex),
    ],
  });
}

export async function findBuyerEntryPda(
  seeds: { roundId: bigint | number; buyer: Address },
  config: { programAddress?: Address } = {}
): Promise<ProgramDerivedAddress> {
  return getProgramDerivedAddress({
    programAddress: config.programAddress ?? LOTTERY_PROGRAM_ID,
    seeds: [
      seed("buyer_entry"),
      u64Le(seeds.roundId),
      addressEncoder.encode(seeds.buyer),
    ],
  });
}

/**
 * PickCounter PDA: counts how many tickets in `roundId` share the exact
 * `(normals, bonusball)` combo. Created on the first matching ticket buy and
 * incremented on subsequent ones; at claim time `claim_winnings` divides
 * `round.perComboPayout[tier]` by this counter so duplicate winners on the
 * same combo split that combo's allocation evenly.
 */
export async function findPickCounterPda(
  seeds: {
    roundId: bigint | number;
    normals: ArrayLike<number>;
    bonusball: number;
  },
  config: { programAddress?: Address } = {}
): Promise<ProgramDerivedAddress> {
  const normals = Uint8Array.from(seeds.normals);
  if (normals.length !== 5) {
    throw new Error(
      `PickCounter PDA expects exactly 5 normals, got ${normals.length}`
    );
  }
  return getProgramDerivedAddress({
    programAddress: config.programAddress ?? LOTTERY_PROGRAM_ID,
    seeds: [
      seed("pick_counter"),
      u64Le(seeds.roundId),
      normals,
      Uint8Array.of(seeds.bonusball),
    ],
  });
}

export function pdaAddress<T extends string = string>(
  pda: ProgramDerivedAddress<T>
): Address<T> {
  return pda[0];
}
