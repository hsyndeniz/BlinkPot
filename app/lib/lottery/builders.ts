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

// ─── account-meta helpers ──────────────────────────────────────────────────

type InstructionWithAccountList = Instruction &
  InstructionWithAccounts<readonly AccountMeta[]>;

function writable(address: Address): AccountMeta {
  return Object.freeze({ address, role: AccountRole.WRITABLE });
}

function appendRemainingAccounts<T extends InstructionWithAccountList>(
  instruction: T,
  remaining: readonly AccountMeta[]
): T {
  return Object.freeze({
    ...instruction,
    accounts: [...instruction.accounts, ...remaining],
  }) as T;
}

// ─── PDA derivations ───────────────────────────────────────────────────────

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
  return Promise.all(
    input.picks.map((pick) =>
      findPickCounterPda({
        roundId: input.roundId,
        normals: pick.normals,
        bonusball: pick.bonusball,
      }).then(pdaAddress)
    )
  );
}

/**
 * `buy_tickets` and `process_subscription` use the same `remaining_accounts`
 * layout: ticket PDAs followed by PickCounter PDAs. This helper derives all
 * three PDA bundles (buyer entry, ticket list, pick counter list) and shapes
 * the writable AccountMeta tail both builders append to their instruction.
 */
async function prepareTicketBatchAccounts(input: {
  roundId: bigint;
  ticketOwner: Address;
  picks: TicketPickArgs[];
  firstTicketIndex: bigint;
}): Promise<{
  buyerEntry: Address;
  ticketPdas: Address[];
  pickCounterPdas: Address[];
  remaining: AccountMeta[];
}> {
  const [buyerEntry, ticketPdas, pickCounterPdas] = await Promise.all([
    findBuyerEntryPda({
      roundId: input.roundId,
      buyer: input.ticketOwner,
    }).then(pdaAddress),
    deriveTicketPdas({
      roundId: input.roundId,
      owner: input.ticketOwner,
      firstTicketIndex: input.firstTicketIndex,
      count: input.picks.length,
    }),
    derivePickCounterPdas({
      roundId: input.roundId,
      picks: input.picks,
    }),
  ]);
  return {
    buyerEntry,
    ticketPdas,
    pickCounterPdas,
    remaining: [
      ...ticketPdas.map(writable),
      ...pickCounterPdas.map(writable),
    ],
  };
}

// ─── public builders ───────────────────────────────────────────────────────

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
  const prep = await prepareTicketBatchAccounts({
    roundId: input.roundId,
    ticketOwner: input.buyer.address,
    picks: input.picks,
    firstTicketIndex: input.firstTicketIndex,
  });

  const instruction = await getBuyTicketsInstructionAsync({
    buyer: input.buyer,
    round: input.round,
    paymentMint: input.paymentMint,
    buyerTokenAccount: input.buyerTokenAccount,
    buyerEntry: prep.buyerEntry,
    referrerAccount: input.referrerAccount,
    parentReferrerAccount: input.parentReferrerAccount,
    picks: input.picks,
    referrer: input.referrer ?? null,
  });

  return {
    instruction: appendRemainingAccounts(instruction, prep.remaining),
    buyerEntry: prep.buyerEntry,
    ticketPdas: prep.ticketPdas,
    pickCounterPdas: prep.pickCounterPdas,
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
  const prep = await prepareTicketBatchAccounts({
    roundId: input.roundId,
    ticketOwner: input.owner,
    picks: input.picks,
    firstTicketIndex: input.firstTicketIndex,
  });

  const instruction = await getProcessSubscriptionInstructionAsync({
    keeper: input.keeper,
    owner: input.owner,
    round: input.round,
    paymentMint: input.paymentMint,
    buyerEntry: prep.buyerEntry,
    referrerAccount: input.referrerAccount,
    parentReferrerAccount: input.parentReferrerAccount,
    picks: input.picks,
  });

  return {
    instruction: appendRemainingAccounts(instruction, prep.remaining),
    buyerEntry: prep.buyerEntry,
    ticketPdas: prep.ticketPdas,
    pickCounterPdas: prep.pickCounterPdas,
  };
}
