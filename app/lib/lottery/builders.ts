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
  getRegisterWinnersBatchInstructionAsync,
  type TicketPickArgs,
} from "../../generated/lottery";
import { findBuyerEntryPda, findTicketPda, pdaAddress } from "./addresses";

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
    picks: input.picks,
  });

  return {
    instruction: appendRemainingAccounts(instruction, ticketPdas.map(writable)),
    buyerEntry,
    ticketPdas,
  };
}

export async function buildRegisterWinnersBatchInstruction(input: {
  trigger: TransactionSigner;
  round: Address;
  ticketAddresses: Address[];
}) {
  const instruction = await getRegisterWinnersBatchInstructionAsync({
    trigger: input.trigger,
    round: input.round,
  });
  return appendRemainingAccounts(
    instruction,
    input.ticketAddresses.map(writable)
  );
}
