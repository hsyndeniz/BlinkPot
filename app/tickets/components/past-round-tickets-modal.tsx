"use client";

import { useMemo, useState } from "react";
import {
  Chip,
  Modal,
  ScrollShadow,
  Spinner,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { Cup, ListUl } from "@gravity-ui/icons";
import type { Account, Address } from "@solana/kit";
import { RoundState, type Round } from "../../generated/lottery";
import { useTickets } from "../../lib/lottery/accounts";
import { isWinningTicket } from "../../lib/lottery/picks";
import { TicketCard } from "./ticket-card";

type Filter = "all" | "winning";

export function PastRoundTicketsModal(props: {
  isOpen: boolean;
  onClose: () => void;
  round: Account<Round>;
  walletAddress: Address;
}) {
  const { isOpen, onClose, round, walletAddress } = props;
  const { tickets, isLoading } = useTickets(round.data.roundId, walletAddress);
  const [filter, setFilter] = useState<Filter>("all");

  const isSettled =
    round.data.state === RoundState.Claimable ||
    round.data.state === RoundState.Archived;

  const winningCount = useMemo(
    () =>
      isSettled
        ? tickets.filter((t) => isWinningTicket(round.data, t.data).winning)
            .length
        : 0,
    [tickets, round.data, isSettled]
  );

  const visible = useMemo(() => {
    if (filter !== "winning") return tickets;
    return tickets.filter((t) => isWinningTicket(round.data, t.data).winning);
  }, [tickets, round.data, filter]);

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Modal.Backdrop>
        <Modal.Container className="max-w-lg">
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>
                Round #{round.data.roundId.toString()} tickets
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="grid gap-3">
              {isSettled && tickets.length > 0 && (
                <ToggleButtonGroup
                  aria-label="Filter tickets"
                  selectedKeys={new Set([filter])}
                  onSelectionChange={(keys) => {
                    const next = Array.from(keys)[0];
                    if (next === "all" || next === "winning") setFilter(next);
                  }}
                  selectionMode="single"
                  disallowEmptySelection
                >
                  <ToggleButton id="all" size="sm">
                    <ListUl />
                    All
                    <Chip size="sm" variant="secondary" className="ml-1">
                      <Chip.Label>{tickets.length}</Chip.Label>
                    </Chip>
                  </ToggleButton>
                  <ToggleButton
                    id="winning"
                    size="sm"
                    isDisabled={winningCount === 0}
                  >
                    <Cup />
                    Winning
                    <Chip
                      size="sm"
                      color="success"
                      variant="secondary"
                      className="ml-1"
                    >
                      <Chip.Label>{winningCount}</Chip.Label>
                    </Chip>
                  </ToggleButton>
                </ToggleButtonGroup>
              )}

              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner size="sm" />
                </div>
              ) : visible.length === 0 ? (
                <p className="py-3 text-center text-sm text-muted">
                  {filter === "winning"
                    ? "No winning tickets in this round."
                    : "No tickets found for this round."}
                </p>
              ) : (
                <ScrollShadow className="max-h-[60vh] pr-1">
                  <div className="space-y-2">
                    {visible.map((t) => (
                      <TicketCard
                        key={t.address}
                        ticket={t}
                        round={{ address: round.address, data: round.data }}
                      />
                    ))}
                  </div>
                </ScrollShadow>
              )}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
