"use client";

import { useMemo, useState } from "react";
import { RoundState } from "../../../generated/lottery";
import {
  useConfig,
  useCurrentRound,
  useTickets,
} from "../../../lib/lottery/accounts";
import { useConsole } from "../../../lib/console/console-context";
import { useWallet } from "../../../lib/wallet/context";
import { useMint } from "../../../lib/lottery/tokens";
import { isWinningTicket } from "../../../lib/lottery/picks";
import {
  pickKey,
  usePickCounters,
} from "../../../lib/lottery/pick-counter";
import {
  ActionButton,
  EmptyState,
  Panel,
  Skeleton,
  StatusBadge,
} from "../shared";
import { TicketRow } from "./ticket-row";

const PAGE_SIZE = 20;

export function TicketList() {
  const { signer, wallet } = useWallet();
  const walletAddress = signer?.address ?? wallet?.account.address;
  const { config } = useConfig();
  const { decimals } = useMint(config?.paymentMint);
  const { round, address: roundAddress } = useCurrentRound();
  const { ticketFilter, setTicketFilter } = useConsole();
  const tickets = useTickets(round?.roundId, walletAddress);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const list = tickets.tickets;
    if (!round) return list;
    return list.filter((t) => {
      const r = isWinningTicket(round, t.data);
      const winning = r.winning;
      switch (ticketFilter) {
        case "winning":
          return winning;
        case "losing":
          return !winning;
        case "claimed":
          return t.data.claimed;
        case "unclaimed":
          return !t.data.claimed;
        default:
          return true;
      }
    });
  }, [tickets.tickets, round, ticketFilter]);

  const pageStart = page * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;
  const pageRows = filtered.slice(pageStart, pageEnd);

  // Batch-fetch pick counters for visible winning tickets to compute exact payouts.
  const winningPicks = useMemo(() => {
    if (!round) return [];
    return pageRows
      .filter((t) => isWinningTicket(round, t.data).winning)
      .map((t) => ({
        roundId: t.data.roundId,
        normals: t.data.normals,
        bonusball: t.data.bonusball,
      }));
  }, [pageRows, round]);

  const counters = usePickCounters(winningPicks);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  return (
    <Panel
      title="Your tickets"
      description={
        round ? (
          <span className="flex items-center gap-2 text-xs">
            Round #{round.roundId.toString()} · state{" "}
            <StatusBadge tone="info">{RoundState[round.state]}</StatusBadge>
            {tickets.isTruncated && (
              <StatusBadge tone="warn">truncated to 500</StatusBadge>
            )}
          </span>
        ) : null
      }
      action={
        <select
          value={ticketFilter}
          onChange={(e) =>
            setTicketFilter(e.target.value as typeof ticketFilter)
          }
          className="h-8 rounded-md border border-border-low bg-card px-2 text-xs"
        >
          <option value="all">All</option>
          <option value="winning">Winning</option>
          <option value="losing">Losing</option>
          <option value="claimed">Claimed</option>
          <option value="unclaimed">Unclaimed</option>
        </select>
      }
    >
      {!walletAddress ? (
        <EmptyState description="Connect a wallet to view your tickets." />
      ) : tickets.isLoading ? (
        <Skeleton rows={4} />
      ) : pageRows.length === 0 ? (
        <EmptyState
          title="No tickets"
          description={
            tickets.tickets.length === 0
              ? "You haven't bought any tickets for this round yet."
              : "No tickets match the current filter."
          }
        />
      ) : (
        <div className="grid gap-2">
          {pageRows.map((t) => {
            const key = pickKey(
              t.data.roundId,
              t.data.normals,
              t.data.bonusball
            );
            return (
              <TicketRow
                key={t.address}
                ticket={t}
                round={round}
                roundAddress={roundAddress}
                paymentMint={config?.paymentMint}
                decimals={decimals}
                pickCount={counters.counts.get(key)}
              />
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between gap-2 text-xs">
          <span className="text-muted">
            Page {page + 1} of {totalPages} · {filtered.length} tickets
          </span>
          <div className="flex items-center gap-2">
            <ActionButton
              variant="secondary"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              ← Prev
            </ActionButton>
            <ActionButton
              variant="secondary"
              size="sm"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </ActionButton>
          </div>
        </div>
      )}
    </Panel>
  );
}
