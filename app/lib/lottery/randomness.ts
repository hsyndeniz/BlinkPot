"use client";

import {
  AccountRole,
  type AccountMeta,
  type AccountSignerMeta,
  type Address,
  type Instruction,
  type InstructionWithAccounts,
  type TransactionSigner,
} from "@solana/kit";
import { createKeyPairSignerFromBytes } from "@solana/signers";
import {
  Connection,
  Keypair,
  PublicKey,
  type TransactionInstruction,
} from "@solana/web3.js";
import type { ClusterMoniker } from "../solana-client";
import { getClusterUrl } from "../solana-client";

type SwitchboardContext = {
  sb: typeof import("@switchboard-xyz/on-demand");
  connection: Connection;
  program: Awaited<
    ReturnType<
      typeof import("@switchboard-xyz/on-demand").AnchorUtils.loadProgramFromConnection
    >
  >;
  queue: Awaited<
    ReturnType<typeof import("@switchboard-xyz/on-demand").getDefaultQueue>
  >;
};

function asAddress(publicKey: PublicKey): Address {
  return publicKey.toBase58() as Address;
}

function accountRole(isWritable: boolean, isSigner: boolean): AccountRole {
  if (isWritable && isSigner) return AccountRole.WRITABLE_SIGNER;
  if (isWritable) return AccountRole.WRITABLE;
  if (isSigner) return AccountRole.READONLY_SIGNER;
  return AccountRole.READONLY;
}

function web3InstructionToKit(
  instruction: TransactionInstruction,
  signers: Map<Address, TransactionSigner> = new Map()
): Instruction &
  InstructionWithAccounts<readonly (AccountMeta | AccountSignerMeta)[]> {
  const accounts = instruction.keys.map((key) => {
    const address = asAddress(key.pubkey);
    const signer = signers.get(address);
    const meta: AccountMeta | (AccountMeta & AccountSignerMeta) = signer
      ? {
          address,
          role: accountRole(key.isWritable, true),
          signer,
        }
      : {
          address,
          role: accountRole(key.isWritable, key.isSigner),
        };
    return Object.freeze(meta);
  });

  return Object.freeze({
    programAddress: asAddress(instruction.programId),
    accounts,
    data: new Uint8Array(instruction.data),
  });
}

async function loadSwitchboard(
  cluster: ClusterMoniker
): Promise<SwitchboardContext> {
  if (cluster !== "devnet") {
    throw new Error(
      "Switchboard randomness is enabled only on devnet in Console V1."
    );
  }

  const sb = await import("@switchboard-xyz/on-demand");
  const connection = new Connection(getClusterUrl(cluster), "confirmed");
  const program = await sb.AnchorUtils.loadProgramFromConnection(connection);
  const queue = await sb.getDefaultQueue(connection.rpcEndpoint);
  return { sb, connection, program, queue };
}

export async function buildCreateRandomnessInstruction(input: {
  cluster: ClusterMoniker;
  payer: Address;
}): Promise<{
  randomnessAccount: Address;
  randomnessSigner: TransactionSigner;
  instruction: Instruction;
}> {
  const { sb, program, queue } = await loadSwitchboard(input.cluster);
  const keypair = Keypair.generate();
  const randomnessSigner = await createKeyPairSignerFromBytes(
    keypair.secretKey
  );
  const [randomness, createIx] = await sb.Randomness.create(
    program,
    keypair,
    queue.pubkey,
    new PublicKey(input.payer)
  );
  const randomnessAccount = asAddress(randomness.pubkey);

  return {
    randomnessAccount,
    randomnessSigner,
    instruction: web3InstructionToKit(
      createIx,
      new Map([[randomnessAccount, randomnessSigner]])
    ),
  };
}

export async function buildSwitchboardCommitInstruction(input: {
  cluster: ClusterMoniker;
  randomnessAccount: Address;
}): Promise<Instruction> {
  const { sb, program, queue } = await loadSwitchboard(input.cluster);
  const randomness = new sb.Randomness(
    program,
    new PublicKey(input.randomnessAccount)
  );
  return web3InstructionToKit(await randomness.commitIx(queue.pubkey));
}

export async function buildSwitchboardRevealInstruction(input: {
  cluster: ClusterMoniker;
  randomnessAccount: Address;
  payer: Address;
}): Promise<Instruction> {
  const { sb, program } = await loadSwitchboard(input.cluster);
  const randomness = new sb.Randomness(
    program,
    new PublicKey(input.randomnessAccount)
  );
  return web3InstructionToKit(
    await randomness.revealIx(new PublicKey(input.payer))
  );
}
