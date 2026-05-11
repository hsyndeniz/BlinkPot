import { address as parseAddress } from "@solana/kit";
import { fetchMaybeRound, fetchMaybeTicket } from "../../../../../generated/lottery";
import {
  findRoundPda,
  findTicketPda,
  pdaAddress,
} from "../../../../../lib/lottery/addresses";
import {
  countMatches,
  tierForMatch,
} from "../../../../../lib/lottery/picks";
import { createSolanaClient } from "../../../../../lib/solana-client";

/**
 * SVG renderer for trophy assets. Reads on-chain Round + Ticket state, draws
 * a gold badge with the winning numbers, the holder's picks, the tier, and
 * "SOULBOUND" framing. Stateless, deterministic, cache-friendly.
 */
const CLUSTER =
  (process.env.NEXT_PUBLIC_CLUSTER as
    | "devnet"
    | "testnet"
    | "mainnet"
    | "localnet"
    | undefined) ?? "devnet";

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderSvg(input: {
  roundId: bigint;
  ticketIndex: bigint;
  picks: number[];
  bonusball: number;
  winningNormals: number[];
  winningBonusball: number;
  matches: number;
  hasBonus: boolean;
  tier: number;
  winning: boolean;
}): string {
  const {
    roundId,
    ticketIndex,
    picks,
    bonusball,
    winningNormals,
    winningBonusball,
    matches,
    hasBonus,
    tier,
    winning,
  } = input;

  const winSet = new Set(winningNormals);
  const bonusHit = bonusball === winningBonusball;

  const W = 600;
  const H = 760;

  // Header band — gold gradient.
  // Pick row positions.
  const ballRowY = 320;
  const ballRowSpacing = 86;
  const ballSize = 38;
  const ballStartX = 60;

  const winRowY = 480;

  const pickBalls = picks
    .map((n, i) => {
      const cx = ballStartX + i * ballRowSpacing;
      const hit = winSet.has(n);
      const fill = hit ? "url(#hit)" : "url(#miss)";
      const stroke = hit ? "#fbbf24" : "#475569";
      return `
        <circle cx="${cx}" cy="${ballRowY}" r="${ballSize}" fill="${fill}" stroke="${stroke}" stroke-width="3" />
        <text x="${cx}" y="${ballRowY + 8}" text-anchor="middle" font-size="26" font-weight="700" fill="${hit ? "#0b0b12" : "#cbd5e1"}">${n}</text>
      `;
    })
    .join("");
  const bonusBallX = ballStartX + 5 * ballRowSpacing;
  const bonusFill = bonusHit ? "url(#hitBonus)" : "url(#missBonus)";
  const bonusStroke = bonusHit ? "#f59e0b" : "#7f1d1d";
  const pickBonusBall = `
    <circle cx="${bonusBallX}" cy="${ballRowY}" r="${ballSize}" fill="${bonusFill}" stroke="${bonusStroke}" stroke-width="3" />
    <text x="${bonusBallX}" y="${ballRowY + 8}" text-anchor="middle" font-size="26" font-weight="700" fill="#0b0b12">${bonusball}</text>
  `;

  const winBalls = winningNormals
    .map((n, i) => {
      const cx = ballStartX + i * ballRowSpacing;
      return `
        <circle cx="${cx}" cy="${winRowY}" r="28" fill="#1e293b" stroke="#fbbf24" stroke-width="2" />
        <text x="${cx}" y="${winRowY + 7}" text-anchor="middle" font-size="20" font-weight="600" fill="#fbbf24">${n}</text>
      `;
    })
    .join("");
  const winBonusBall = `
    <circle cx="${bonusBallX}" cy="${winRowY}" r="28" fill="#7f1d1d" stroke="#fbbf24" stroke-width="2" />
    <text x="${bonusBallX}" y="${winRowY + 7}" text-anchor="middle" font-size="20" font-weight="600" fill="#fbbf24">${winningBonusball}</text>
  `;

  const subtitle = winning
    ? `WINNER · TIER ${tier} · ${matches} match${matches === 1 ? "" : "es"}${hasBonus ? " + bonus" : ""}`
    : `BLINKPOT TROPHY`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0f172a" />
      <stop offset="1" stop-color="#020617" />
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fde68a" />
      <stop offset=".5" stop-color="#facc15" />
      <stop offset="1" stop-color="#b45309" />
    </linearGradient>
    <linearGradient id="hit" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fde68a" />
      <stop offset="1" stop-color="#f59e0b" />
    </linearGradient>
    <linearGradient id="miss" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1e293b" />
      <stop offset="1" stop-color="#0f172a" />
    </linearGradient>
    <linearGradient id="hitBonus" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fcd34d" />
      <stop offset="1" stop-color="#d97706" />
    </linearGradient>
    <linearGradient id="missBonus" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7f1d1d" />
      <stop offset="1" stop-color="#450a0a" />
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="${W}" height="${H}" fill="url(#bg)" />
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" fill="none" stroke="url(#gold)" stroke-width="3" rx="16" />

  <text x="${W / 2}" y="100" text-anchor="middle" font-family="serif" font-size="46" font-weight="700" fill="url(#gold)" letter-spacing="6">BLINKPOT</text>
  <text x="${W / 2}" y="140" text-anchor="middle" font-size="18" letter-spacing="8" fill="#cbd5e1">${escape(subtitle)}</text>

  <text x="${W / 2}" y="220" text-anchor="middle" font-size="32" font-weight="600" fill="#e2e8f0">Round ${roundId}</text>
  <text x="${W / 2}" y="252" text-anchor="middle" font-size="18" fill="#94a3b8">Ticket #${ticketIndex}</text>

  <text x="${ballStartX - 10}" y="${ballRowY - 60}" font-size="14" letter-spacing="3" fill="#64748b">YOUR PICKS</text>
  ${pickBalls}
  ${pickBonusBall}

  <text x="${ballStartX - 10}" y="${winRowY - 50}" font-size="14" letter-spacing="3" fill="#64748b">DRAW</text>
  ${winBalls}
  ${winBonusBall}

  <text x="${W / 2}" y="${H - 60}" text-anchor="middle" font-size="14" letter-spacing="6" fill="#fbbf24">SOULBOUND · ON-CHAIN · FOREVER</text>
</svg>`;
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ round: string; owner: string; index: string }> }
) {
  const { round: roundParam, owner: ownerParam, index: indexParam } =
    await context.params;

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
    return new Response("not found", { status: 404 });
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
  const winning = round.tierIsWinning?.[tier] === true;

  const svg = renderSvg({
    roundId,
    ticketIndex,
    picks: [...ticket.normals],
    bonusball: ticket.bonusball,
    winningNormals: [...round.winningNormals],
    winningBonusball: round.winningBonusball,
    matches: m.matches,
    hasBonus: m.hasBonusball,
    tier,
    winning,
  });

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
