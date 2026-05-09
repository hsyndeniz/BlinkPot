"use client";

import { useState } from "react";
import { Button, Card, Spinner } from "@heroui/react";
import { ArrowDown } from "@gravity-ui/icons";
import { useCurrentRound, useRounds } from "../../lib/lottery/accounts";
import { useWallet } from "../../lib/wallet/context";
import { PastRoundCard } from "./past-round-card";

const PAGE_SIZE = 5n;

export function PastRoundsList() {
  const { signer, wallet } = useWallet();
  const walletAddress = signer?.address ?? wallet?.account.address;
  const { round: currentRound, currentRoundId } = useCurrentRound();

  const [pages, setPages] = useState(1);

  // Show rounds strictly older than the current round (current is rendered
  // by CurrentRoundTicketsCard above this list).
  const latestPast =
    currentRoundId && currentRoundId > 0n ? currentRoundId - 1n : 0n;
  const earliest =
    latestPast > BigInt(pages) * PAGE_SIZE
      ? latestPast - BigInt(pages) * PAGE_SIZE + 1n
      : 1n;

  const { rounds, isLoading } = useRounds({
    from: earliest,
    to: latestPast,
  });

  if (!walletAddress) return null;
  if (!currentRound) return null;
  if (latestPast <= 0n) return null;

  // The user may not have played any of these — PastRoundCard hides itself
  // when the user has zero tickets, so the list naturally collapses to only
  // played rounds.
  return (
    <Card className="w-full">
      <Card.Content className="grid gap-3">
        <span className="text-sm font-semibold">Past rounds</span>

        {isLoading && rounds.length === 0 ? (
          <div className="flex items-center justify-center py-6">
            <Spinner size="sm" />
          </div>
        ) : (
          <div className="grid gap-2">
            {rounds.map((r) => (
              <PastRoundCard
                key={r.address}
                round={r}
                walletAddress={walletAddress}
              />
            ))}
          </div>
        )}

        {earliest > 1n && (
          <Button
            variant="ghost"
            size="sm"
            onPress={() => setPages((p) => p + 1)}
          >
            <ArrowDown />
            Load older rounds
          </Button>
        )}
      </Card.Content>
    </Card>
  );
}
