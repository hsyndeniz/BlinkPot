"use client";

import {
  AccountRole,
  type AccountMeta,
  type Address,
  type Instruction,
  type InstructionWithAccounts,
  type TransactionSigner,
} from "@solana/kit";
import {
  getBuyTicketsInstructionAsync,
  getProcessSubscriptionInstructionAsync,
  type TicketPickArgs,
} from "../../generated/lottery";
import {
  findBuyerEntryPda,
  findPickCounterPda,
  findTicketPda,
  pdaAddress,
} from "./addresses";

type InstructionWithAccountList = Instruction &
  InstructionWithAccounts<readonly AccountMeta[]>;

function writable(address: Address): AccountMeta {
  return Object.freeze({ address, role: AccountRole.WRITABLE });
}

function appendRemainingAccounts<
  TInstruction extends InstructionWithAccountList,
>(
  instruction: TInstruction,
  remainingAccounts: readonly AccountMeta[]
): TInstruction {
  return Object.freeze({
    ...instruction,
    accounts: [...instruction.accounts, ...remainingAccounts],
  }) as TInstruction;
}

export async function deriveTicketPdas(input: {
  roundId: bigint;
  owner: Address;
  firstTicketIndex: bigint;
  count: number;
}): Promise<Address[]> {
  const out: Address[] = [];
  for (let i = 0; i < input.count; i += 1) {
    out.push(
      pdaAddress(
        await findTicketPda({
          roundId: input.roundId,
          owner: input.owner,
          ticketIndex: input.firstTicketIndex + BigInt(i),
        })
      )
    );
  }
  return out;
}

/**
 * One PickCounter PDA per pick in the batch. The program tolerates duplicates —
 * if multiple picks resolve to the same PDA, the on-chain `upsert_pick_counter`
 * helper creates on the first occurrence and increments on subsequent ones.
 */
export async function derivePickCounterPdas(input: {
  roundId: bigint;
  picks: TicketPickArgs[];
}): Promise<Address[]> {
  const out: Address[] = [];
  for (const pick of input.picks) {
    out.push(
      pdaAddress(
        await findPickCounterPda({
          roundId: input.roundId,
          normals: pick.normals,
          bonusball: pick.bonusball,
        })
      )
    );
  }
  return out;
}

export async function buildBuyTicketsInstruction(input: {
  buyer: TransactionSigner;
  round: Address;
  roundId: bigint;
  paymentMint: Address;
  buyerTokenAccount: Address;
  picks: TicketPickArgs[];
  firstTicketIndex: bigint;
  referrer?: Address;
  referrerAccount?: Address;
  parentReferrerAccount?: Address;
}) {
  const buyerEntry = pdaAddress(
    await findBuyerEntryPda({
      roundId: input.roundId,
      buyer: input.buyer.address,
    })
  );
  const ticketPdas = await deriveTicketPdas({
    roundId: input.roundId,
    owner: input.buyer.address,
    firstTicketIndex: input.firstTicketIndex,
    count: input.picks.length,
  });
  const pickCounterPdas = await derivePickCounterPdas({
    roundId: input.roundId,
    picks: input.picks,
  });
  const instruction = await getBuyTicketsInstructionAsync({
    buyer: input.buyer,
    round: input.round,
    paymentMint: input.paymentMint,
    buyerTokenAccount: input.buyerTokenAccount,
    buyerEntry,
    referrerAccount: input.referrerAccount,
    parentReferrerAccount: input.parentReferrerAccount,
    picks: input.picks,
    referrer: input.referrer ?? null,
  });

  // remaining_accounts layout matches `buy_tickets`: ticket PDAs first, then the
  // PickCounter PDAs (one per pick — duplicates allowed; the program upserts).
  return {
    instruction: appendRemainingAccounts(instruction, [
      ...ticketPdas.map(writable),
      ...pickCounterPdas.map(writable),
    ]),
    buyerEntry,
    ticketPdas,
    pickCounterPdas,
  };
}

export async function buildProcessSubscriptionInstruction(input: {
  keeper: TransactionSigner;
  owner: Address;
  round: Address;
  roundId: bigint;
  paymentMint: Address;
  picks: TicketPickArgs[];
  firstTicketIndex: bigint;
  referrerAccount?: Address;
  parentReferrerAccount?: Address;
}) {
  const buyerEntry = pdaAddress(
    await findBuyerEntryPda({ roundId: input.roundId, buyer: input.owner })
  );
  const ticketPdas = await deriveTicketPdas({
    roundId: input.roundId,
    owner: input.owner,
    firstTicketIndex: input.firstTicketIndex,
    count: input.picks.length,
  });
  const pickCounterPdas = await derivePickCounterPdas({
    roundId: input.roundId,
    picks: input.picks,
  });
  const instruction = await getProcessSubscriptionInstructionAsync({
    keeper: input.keeper,
    owner: input.owner,
    round: input.round,
    paymentMint: input.paymentMint,
    buyerEntry,
    referrerAccount: input.referrerAccount,
    parentReferrerAccount: input.parentReferrerAccount,
    picks: input.picks,
  });

  return {
    instruction: appendRemainingAccounts(instruction, [
      ...ticketPdas.map(writable),
      ...pickCounterPdas.map(writable),
    ]),
    buyerEntry,
    ticketPdas,
    pickCounterPdas,
  };
}
