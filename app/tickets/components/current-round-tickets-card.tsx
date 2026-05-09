"use client";

import { Card, Chip, ScrollShadow, Spinner } from "@heroui/react";
import { Ticket as TicketIcon } from "@gravity-ui/icons";
import { useCurrentRound, useTickets } from "../../lib/lottery/accounts";
import { useWallet } from "../../lib/wallet/context";
import { TicketCard } from "./ticket-card";

export function CurrentRoundTicketsCard() {
  const { signer, wallet } = useWallet();
  const walletAddress = signer?.address ?? wallet?.account.address;
  const { round, address: roundAddress } = useCurrentRound();

  const { tickets, isLoading } = useTickets(round?.roundId, walletAddress);

  if (!walletAddress) return null;

  return (
    <Card className="w-full">
      <Card.Content className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TicketIcon className="size-4 text-muted" />
            <span className="text-sm font-semibold">Current round tickets</span>
            {round && (
              <Chip size="sm" variant="secondary">
                <Chip.Label>Round #{round.roundId.toString()}</Chip.Label>
              </Chip>
            )}
          </div>
          {tickets.length > 0 && (
            <Chip size="sm" variant="secondary">
              <Chip.Label>{tickets.length}</Chip.Label>
            </Chip>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-6 text-sm text-muted">
            <Spinner size="sm" />
          </div>
        ) : tickets.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted">
            You haven&apos;t bought any tickets for this round yet.
          </p>
        ) : (
          <ScrollShadow className="max-h-[400px] p-2">
            <div className="space-y-2">
              {tickets.map((t) => (
                <TicketCard
                  key={t.address}
                  ticket={t}
                  round={
                    round && roundAddress
                      ? { address: roundAddress, data: round }
                      : undefined
                  }
                />
              ))}
            </div>
          </ScrollShadow>
        )}
      </Card.Content>
    </Card>
  );
}
