import { NextResponse } from "next/server";

/**
 * Static trophy metadata. Stateless — no RPC, no on-chain reads. Derives
 * everything from the URL params so the endpoint always succeeds and is
 * cacheable forever. The on-chain MPL Core asset URI points here.
 */

const HOST = process.env.NEXT_PUBLIC_APP_URL ?? "https://blinkpot.io";

export async function GET(
  _req: Request,
  context: { params: Promise<{ round: string; owner: string; index: string }> }
) {
  const { round, owner, index } = await context.params;

  const body = {
    name: `BlinkPot Round ${round} — Trophy #${index}`,
    symbol: "BPTROPHY",
    description:
      `Soulbound proof-of-win from BlinkPot Round ${round}. ` +
      `This trophy is permanently bound to its holder and can never be transferred. ` +
      `Every winner, every round, on-chain forever.`,
    image: `${HOST}/api/trophy-image/${round}/${owner}/${index}`,
    external_url: `${HOST}/trophies`,
    attributes: [
      { trait_type: "Round", value: round },
      { trait_type: "Ticket Index", value: index },
      { trait_type: "Winner", value: owner },
      { trait_type: "Soulbound", value: "Yes" },
    ],
    properties: {
      category: "image",
      files: [
        {
          uri: `${HOST}/api/trophy-image/${round}/${owner}/${index}`,
          type: "image/svg+xml",
        },
      ],
    },
  };

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
