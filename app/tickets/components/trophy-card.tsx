"use client";

import { Card, Chip } from "@heroui/react";
import { Lock } from "@gravity-ui/icons";

export type TrophyAsset = {
  /** Core asset address (the cNFT-style address — single Pubkey for Core). */
  id: string;
  /** Owner wallet address. */
  owner: string;
  /** Metadata name from MPL Core asset (e.g. "BlinkPot Round 7 #42"). */
  name: string;
  /** Image URL — points at our `/api/trophy-image` SVG endpoint. */
  imageUrl?: string;
};

function shortAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function TrophyCard(props: { trophy: TrophyAsset; isOwner?: boolean }) {
  const { trophy, isOwner } = props;
  return (
    <Card variant="default" className="overflow-hidden border p-0">
      <div className="aspect-[5/6] w-full bg-default-50">
        {trophy.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={trophy.imageUrl}
            alt={trophy.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted">
            No image
          </div>
        )}
      </div>
      <Card.Content className="grid gap-1.5 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold">{trophy.name}</span>
          <Chip size="sm" color="warning" variant="secondary">
            <Lock />
            <Chip.Label>Soulbound</Chip.Label>
          </Chip>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-muted">
          <span>Owner</span>
          <span className="font-mono">
            {isOwner ? "You" : shortAddress(trophy.owner)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-muted">
          <span>Asset</span>
          <span className="font-mono">{shortAddress(trophy.id)}</span>
        </div>
      </Card.Content>
    </Card>
  );
}
