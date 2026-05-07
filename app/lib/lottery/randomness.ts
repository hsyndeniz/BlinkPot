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

// ─── kit ↔ web3.js bridge ──────────────────────────────────────────────────
// Switchboard's SDK only emits @solana/web3.js v1 instructions. These helpers
// translate them into kit Instruction objects so the rest of the app can stay
// kit-native.

function pickAccountRole(isWritable: boolean, isSigner: boolean): AccountRole {
  if (isWritable && isSigner) return AccountRole.WRITABLE_SIGNER;
  if (isWritable) return AccountRole.WRITABLE;
  if (isSigner) return AccountRole.READONLY_SIGNER;
  return AccountRole.READONLY;
}

function asAddress(publicKey: PublicKey): Address {
  return publicKey.toBase58() as Address;
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
      ? { address, role: pickAccountRole(key.isWritable, true), signer }
      : { address, role: pickAccountRole(key.isWritable, key.isSigner) };
    return Object.freeze(meta);
  });

  return Object.freeze({
    programAddress: asAddress(instruction.programId),
    accounts,
    data: new Uint8Array(instruction.data),
  });
}

// ─── Switchboard context loader ────────────────────────────────────────────
// Importing the Switchboard SDK + creating a Connection + loading the program
// + fetching the queue is expensive (hundreds of ms). Cache one promise per
// cluster so Prepare → Commit → Reveal share the load instead of re-doing it
// three times.

type SwitchboardSdk = typeof import("@switchboard-xyz/on-demand");

type SwitchboardContext = {
  sb: SwitchboardSdk;
  connection: Connection;
  program: Awaited<
    ReturnType<SwitchboardSdk["AnchorUtils"]["loadProgramFromConnection"]>
  >;
  queue: Awaited<ReturnType<SwitchboardSdk["getDefaultQueue"]>>;
};

const switchboardCache = new Map<ClusterMoniker, Promise<SwitchboardContext>>();

function loadSwitchboard(cluster: ClusterMoniker): Promise<SwitchboardContext> {
  if (cluster !== "devnet") {
    return Promise.reject(
      new Error(
        "Switchboard randomness is enabled only on devnet in Console V1."
      )
    );
  }
  const cached = switchboardCache.get(cluster);
  if (cached) return cached;

  const promise = (async () => {
    const sb = await import("@switchboard-xyz/on-demand");
    const connection = new Connection(getClusterUrl(cluster), "confirmed");
    const program = await sb.AnchorUtils.loadProgramFromConnection(connection);
    const queue = await sb.getDefaultQueue(connection.rpcEndpoint);
    return { sb, connection, program, queue };
  })();

  // Drop the cache on failure so a retry can re-attempt cleanly.
  promise.catch(() => switchboardCache.delete(cluster));
  switchboardCache.set(cluster, promise);
  return promise;
}

// ─── public builders ───────────────────────────────────────────────────────

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
