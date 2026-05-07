"use client";

import { useState } from "react";
import { address as parseAddress, type Address } from "@solana/kit";
import { type TicketPickArgs } from "../../../generated/lottery";
import {
  useCurrentRound,
} from "../../../lib/lottery/accounts";
import { useProcessSubscription } from "../../../lib/lottery/actions";
import {
  ActionButton,
  Field,
  Panel,
  StatusBadge,
} from "../shared";

function tryParseAddress(value: string): Address | undefined {
  try {
    return value.trim() ? parseAddress(value.trim()) : undefined;
  } catch {
    return undefined;
  }
}

function quickPicks(count: number, normalMax: number, bonusMax: number): TicketPickArgs[] {
  const out: TicketPickArgs[] = [];
  for (let n = 0; n < count; n += 1) {
    const pool = Array.from({ length: normalMax }, (_, i) => i + 1);
    for (let i = pool.length - 1; i > pool.length - 6; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    out.push({
      normals: Uint8Array.from(pool.slice(-5).sort((a, b) => a - b)),
      bonusball: 1 + Math.floor(Math.random() * bonusMax),
    });
  }
  return out;
}

export function KeeperProcessForm() {
  const { round, address: roundAddress } = useCurrentRound();
  const process = useProcessSubscription();
  const [ownerInput, setOwnerInput] = useState("");
  const [countInput, setCountInput] = useState("1");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setLocalError(null);
    try {
      if (!round || !roundAddress) throw new Error("No active round.");
      const owner = tryParseAddress(ownerInput);
      if (!owner) throw new Error("Enter a valid owner address.");
      const count = Number(countInput);
      if (!Number.isFinite(count) || count < 1)
        throw new Error("Pick count must be at least 1.");
      const picks = quickPicks(count, round.normalBallMax, round.bonusballMax);
      await process
        .trigger({
          owner,
          round: { address: roundAddress, data: round },
          picks,
        })
        .catch(() => {});
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Panel
      title="Keeper · process subscription"
      description={
        <StatusBadge tone="info">
          Operates on someone else&apos;s subscription. The keeper signs and pays
          ticket-account rent; tickets are minted to the owner.
        </StatusBadge>
      }
    >
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Subscription owner address"
            value={ownerInput}
            onChange={setOwnerInput}
            placeholder="Owner wallet pubkey"
            hint="Daily ticket count must match the subscription's stored count."
          />
          <Field
            label="Pick count (must equal daily_ticket_count)"
            value={countInput}
            onChange={setCountInput}
            placeholder="1"
          />
        </div>
        {(localError ?? process.lastError) && (
          <p className="text-xs text-destructive">
            {localError ?? process.lastError}
          </p>
        )}
        <div className="flex justify-end">
          <ActionButton
            variant="primary"
            size="sm"
            isPending={process.isPending}
            onClick={() => void handleSubmit()}
          >
            Process
          </ActionButton>
        </div>
      </div>
    </Panel>
  );
}
