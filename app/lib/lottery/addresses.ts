"use client";

import {
  getAddressEncoder,
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

// Re-export codama-generated finders so callers have a single import surface.
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

const addressEncoder = getAddressEncoder();
const utf8 = new TextEncoder();

function seed(value: string): Uint8Array {
  return utf8.encode(value);
}

export function u64Le(value: bigint | number): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(value), true);
  return out;
}

type FindOptions = { programAddress?: Address };

const defaultProgramAddress = (config: FindOptions) =>
  config.programAddress ?? LOTTERY_PROGRAM_ID;

export function findRoundPda(
  roundId: bigint | number,
  config: FindOptions = {}
): Promise<ProgramDerivedAddress> {
  return getProgramDerivedAddress({
    programAddress: defaultProgramAddress(config),
    seeds: [seed("round"), u64Le(roundId)],
  });
}

export function findTicketPda(
  seeds: {
    roundId: bigint | number;
    owner: Address;
    ticketIndex: bigint | number;
  },
  config: FindOptions = {}
): Promise<ProgramDerivedAddress> {
  return getProgramDerivedAddress({
    programAddress: defaultProgramAddress(config),
    seeds: [
      seed("ticket"),
      u64Le(seeds.roundId),
      addressEncoder.encode(seeds.owner),
      u64Le(seeds.ticketIndex),
    ],
  });
}

export function findBuyerEntryPda(
  seeds: { roundId: bigint | number; buyer: Address },
  config: FindOptions = {}
): Promise<ProgramDerivedAddress> {
  return getProgramDerivedAddress({
    programAddress: defaultProgramAddress(config),
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
export function findPickCounterPda(
  seeds: {
    roundId: bigint | number;
    normals: ArrayLike<number>;
    bonusball: number;
  },
  config: FindOptions = {}
): Promise<ProgramDerivedAddress> {
  const normals = Uint8Array.from(seeds.normals);
  if (normals.length !== 5) {
    throw new Error(
      `PickCounter PDA expects exactly 5 normals, got ${normals.length}`
    );
  }
  return getProgramDerivedAddress({
    programAddress: defaultProgramAddress(config),
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
