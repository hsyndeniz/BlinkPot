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
  getCompoundWinningsInstructionAsync,
  getProcessSubscriptionInstructionAsync,
  getTallyRoundInstructionAsync,
  type TicketPickArgs,
} from "../../generated/lottery";
import {
  findBuyerEntryPda,
  findCompoundStatePda,
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

export async function buildBuyTicketsInstruction(input: {
  buyer: TransactionSigner;
  round: Address;
  roundId: bigint;
  usdcMint: Address;
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
  const instruction = await getBuyTicketsInstructionAsync({
    buyer: input.buyer,
    round: input.round,
    usdcMint: input.usdcMint,
    buyerTokenAccount: input.buyerTokenAccount,
    buyerEntry,
    referrerAccount: input.referrerAccount,
    parentReferrerAccount: input.parentReferrerAccount,
    picks: input.picks,
    referrer: input.referrer ?? null,
  });

  return {
    instruction: appendRemainingAccounts(instruction, ticketPdas.map(writable)),
    buyerEntry,
    ticketPdas,
  };
}

export async function buildProcessSubscriptionInstruction(input: {
  keeper: TransactionSigner;
  owner: Address;
  round: Address;
  roundId: bigint;
  usdcMint: Address;
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
  const instruction = await getProcessSubscriptionInstructionAsync({
    keeper: input.keeper,
    owner: input.owner,
    round: input.round,
    usdcMint: input.usdcMint,
    buyerEntry,
    referrerAccount: input.referrerAccount,
    parentReferrerAccount: input.parentReferrerAccount,
    picks: input.picks,
  });

  return {
    instruction: appendRemainingAccounts(instruction, ticketPdas.map(writable)),
    buyerEntry,
    ticketPdas,
  };
}

/**
 * Build a `tally_round` instruction. Pass `winningTicketAddresses` as the
 * tickets to score; set `finalize: true` on the LAST chunk of a multi-tx
 * tally to compute pool amounts and transition the round to Claimable.
 */
export async function buildTallyRoundInstruction(input: {
  trigger: TransactionSigner;
  round: Address;
  usdcMint: Address;
  winningTicketAddresses: Address[];
  finalize: boolean;
}) {
  const instruction = await getTallyRoundInstructionAsync({
    trigger: input.trigger,
    round: input.round,
    usdcMint: input.usdcMint,
    finalize: input.finalize,
  });
  return appendRemainingAccounts(
    instruction,
    input.winningTicketAddresses.map(writable)
  );
}

/**
 * Build a `compound_winnings` instruction. `winningTicketAddresses` are
 * Ticket PDAs from a previously-claimable round whose payouts will be
 * re-invested into `picks.length` new tickets in the currently-open round.
 *
 * Order in remaining_accounts: winning tickets FIRST, new ticket PDAs LAST.
 */
export async function buildCompoundWinningsInstruction(input: {
  buyer: TransactionSigner;
  round: Address;
  roundId: bigint;
  sourceRound: Address;
  usdcMint: Address;
  picks: TicketPickArgs[];
  firstTicketIndex: bigint;
  winningTicketAddresses: Address[];
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
  const compoundState = pdaAddress(
    await findCompoundStatePda({ buyer: input.buyer.address })
  );
  const newTicketPdas = await deriveTicketPdas({
    roundId: input.roundId,
    owner: input.buyer.address,
    firstTicketIndex: input.firstTicketIndex,
    count: input.picks.length,
  });
  const instruction = await getCompoundWinningsInstructionAsync({
    buyer: input.buyer,
    round: input.round,
    sourceRound: input.sourceRound,
    usdcMint: input.usdcMint,
    buyerEntry,
    compoundState,
    referrerAccount: input.referrerAccount,
    parentReferrerAccount: input.parentReferrerAccount,
    picks: input.picks,
    referrer: input.referrer ?? null,
  });

  // remaining_accounts: winning tickets first, then new ticket PDAs.
  const remaining = [
    ...input.winningTicketAddresses.map(writable),
    ...newTicketPdas.map(writable),
  ];
  return {
    instruction: appendRemainingAccounts(instruction, remaining),
    buyerEntry,
    compoundState,
    newTicketPdas,
  };
}
