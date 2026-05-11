/**
 * Static trophy SVG. Stateless — no RPC, no on-chain reads, no Solana client.
 * Generates the badge purely from the URL params so it always succeeds and is
 * cacheable forever. The on-chain MPL Core asset URI points here.
 */

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function shortAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function padRound(round: string): string {
  // "143" → "0143". Leaves longer values alone.
  if (/^\d+$/.test(round) && round.length < 4) {
    return round.padStart(4, "0");
  }
  return round;
}

function renderSvg(input: {
  roundLabel: string;
  ticketIndex: string;
  ownerShort: string;
}): string {
  const { roundLabel, ticketIndex, ownerShort } = input;

  const topArc = `BLINKPOT · SOULBOUND · ROUND No. ${roundLabel}`;
  const bottomArc = `VERIFIED ON-CHAIN · ${ownerShort}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 460" width="1024" height="1024">
  <defs>
    <linearGradient id="tr-gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fbe7a8"/>
      <stop offset="38%" stop-color="#E8C77A"/>
      <stop offset="62%" stop-color="#b8924a"/>
      <stop offset="100%" stop-color="#fbe7a8"/>
    </linearGradient>
    <radialGradient id="tr-bg" cx="30%" cy="25%" r="80%">
      <stop offset="0%" stop-color="#1c2040"/>
      <stop offset="70%" stop-color="#0A0B14"/>
    </radialGradient>
    <path id="tr-top" d="M 30 230 A 200 200 0 0 1 430 230"/>
    <path id="tr-bot" d="M 50 230 A 180 180 0 0 0 410 230"/>
    <radialGradient id="tr-sheen" cx="30%" cy="20%" r="80%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.18)"/>
      <stop offset="60%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
  </defs>

  <circle cx="230" cy="230" r="228" fill="url(#tr-bg)"/>
  <circle cx="230" cy="230" r="228" fill="url(#tr-sheen)"/>
  <circle cx="230" cy="230" r="222" fill="none" stroke="url(#tr-gold)" stroke-width="1.2"/>
  <circle cx="230" cy="230" r="206" fill="none" stroke="url(#tr-gold)" stroke-width="0.6" opacity="0.7"/>

  <text fill="url(#tr-gold)" font-family="ui-monospace, Menlo, monospace" font-size="13" letter-spacing="5.4">
    <textPath href="#tr-top" startOffset="50%" text-anchor="middle">${escape(topArc)}</textPath>
  </text>
  <text fill="url(#tr-gold)" font-family="ui-monospace, Menlo, monospace" font-size="11" letter-spacing="4" opacity="0.85">
    <textPath href="#tr-bot" startOffset="50%" text-anchor="middle">${escape(bottomArc)}</textPath>
  </text>

  <g stroke="url(#tr-gold)" stroke-width="1" fill="none" stroke-linecap="round">
    <path d="M 60 230 L 90 230"/>
    <path d="M 70 224 L 80 220"/><path d="M 70 236 L 80 240"/>
    <path d="M 80 222 L 88 218"/><path d="M 80 238 L 88 242"/>
    <path d="M 400 230 L 370 230"/>
    <path d="M 390 224 L 380 220"/><path d="M 390 236 L 380 240"/>
    <path d="M 380 222 L 372 218"/><path d="M 380 238 L 372 242"/>
  </g>

  <g transform="translate(165,118) scale(1.30)">
    <circle cx="50" cy="50" r="44" fill="#0A0B14" stroke="rgba(255,255,255,0.10)" stroke-width="1"/>
    <path d="M 50 6 A 44 44 0 0 1 94 50" fill="none" stroke="url(#tr-gold)" stroke-width="3" stroke-linecap="round"/>
    <path d="M 56 22 L 36 56 L 49 56 L 44 78 L 64 44 L 51 44 L 56 22 Z" fill="url(#tr-gold)"/>
  </g>

  <text x="230" y="290" text-anchor="middle" font-family="ui-monospace, Menlo, monospace" font-size="10" letter-spacing="3.2" fill="#E8C77A" opacity="0.7">TICKET</text>
  <text x="230" y="332" text-anchor="middle" font-family="Inter Tight, system-ui, sans-serif" font-weight="700" font-size="42" letter-spacing="-0.8" fill="url(#tr-gold)">#${escape(ticketIndex)}</text>
  <text x="230" y="362" text-anchor="middle" font-family="ui-monospace, Menlo, monospace" font-size="11" letter-spacing="2" fill="#E8C77A" opacity="0.55">${escape(ownerShort)}</text>
</svg>`;
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ round: string; owner: string; index: string }> }
) {
  const { round, owner, index } = await context.params;

  const svg = renderSvg({
    roundLabel: padRound(round),
    ticketIndex: index,
    ownerShort: shortAddr(owner),
  });

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
