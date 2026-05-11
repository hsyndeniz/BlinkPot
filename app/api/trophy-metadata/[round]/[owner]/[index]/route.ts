import { NextResponse } from "next/server";
import { address as parseAddress } from "@solana/kit";
import {
  fetchMaybeRound,
  fetchMaybeTicket,
} from "../../../../../generated/lottery";
import {
  findRoundPda,
  findTicketPda,
  pdaAddress,
} from "../../../../../lib/lottery/addresses";
import { countMatches, tierForMatch } from "../../../../../lib/lottery/picks";
import { createSolanaClient } from "../../../../../lib/solana-client";

/**
 * Trophy metadata served per (round, owner, ticket_index). The on-chain
 * trophy NFT's `uri` field points here; wallets and DAS-style indexers fetch
 * this URL to render the asset. State is reconstructed from the Round + Ticket
 * PDAs — no off-chain database.
 *
 * Cluster defaults to `devnet`. Override with `NEXT_PUBLIC_CLUSTER` env var.
 */
const CLUSTER =
  (process.env.NEXT_PUBLIC_CLUSTER as
    | "devnet"
    | "testnet"
    | "mainnet"
    | "localnet"
    | undefined) ?? "devnet";

const HOST = process.env.NEXT_PUBLIC_APP_URL ?? "https://blinkpot.io";

export async function GET(
  _req: Request,
  context: { params: Promise<{ round: string; owner: string; index: string }> }
) {
  const {
    round: roundParam,
    owner: ownerParam,
    index: indexParam,
  } = await context.params;

  const roundId = BigInt(roundParam);
  const ticketIndex = BigInt(indexParam);
  const owner = parseAddress(ownerParam);

  const client = createSolanaClient(CLUSTER);
  const rpc = client.rpc;

  const [roundAddress, ticketAddress] = await Promise.all([
    findRoundPda(roundId).then(pdaAddress),
    findTicketPda({ roundId, owner, ticketIndex }).then(pdaAddress),
  ]);

  const [roundAcc, ticketAcc] = await Promise.all([
    fetchMaybeRound(rpc, roundAddress, { commitment: "confirmed" }),
    fetchMaybeTicket(rpc, ticketAddress, { commitment: "confirmed" }),
  ]);

  if (!roundAcc.exists || !ticketAcc.exists) {
    return NextResponse.json(
      { error: "round or ticket not found" },
      { status: 404 }
    );
  }

  const round = roundAcc.data;
  const ticket = ticketAcc.data;

  const m = countMatches(
    ticket.normals,
    ticket.bonusball,
    round.winningNormals,
    round.winningBonusball
  );
  const tier = tierForMatch(m.matches, m.hasBonusball);
  const tierWinning = round.tierIsWinning?.[tier] === true;

  const picksDisplay =
    [...ticket.normals].join(", ") + ` + Bonus ${ticket.bonusball}`;
  const winningDisplay =
    [...round.winningNormals].join(", ") + ` + Bonus ${round.winningBonusball}`;

  const imageUrl = `${HOST}/api/trophy-image/${roundId}/${owner}/${ticketIndex}`;

  const metadata = {
    name: `BlinkPot Round ${roundId} #${ticketIndex}`,
    description: tierWinning
      ? `Soulbound winner trophy. Round ${roundId}, Ticket #${ticketIndex}. ` +
        `Picks ${picksDisplay} matched ${m.matches} normal${
          m.matches === 1 ? "" : "s"
        }${m.hasBonusball ? " plus the bonusball" : ""} (winning numbers ${winningDisplay}). ` +
        `Tier ${tier}.`
      : `BlinkPot trophy. Round ${roundId}, Ticket #${ticketIndex}. Picks ${picksDisplay}.`,
    image: imageUrl,
    external_url: `${HOST}/tickets`,
    attributes: [
      { trait_type: "Round", value: Number(roundId) },
      { trait_type: "Ticket #", value: Number(ticketIndex) },
      { trait_type: "Normal 1", value: ticket.normals[0] },
      { trait_type: "Normal 2", value: ticket.normals[1] },
      { trait_type: "Normal 3", value: ticket.normals[2] },
      { trait_type: "Normal 4", value: ticket.normals[3] },
      { trait_type: "Normal 5", value: ticket.normals[4] },
      { trait_type: "Bonusball", value: ticket.bonusball },
      { trait_type: "Tier", value: tier },
      { trait_type: "Matches", value: m.matches },
      { trait_type: "Bonusball Hit", value: m.hasBonusball ? "Yes" : "No" },
      { trait_type: "Soulbound", value: "Permanent" },
    ],
    properties: {
      files: [{ uri: imageUrl, type: "image/svg+xml" }],
      category: "image",
    },
  };

  return NextResponse.json(metadata, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
