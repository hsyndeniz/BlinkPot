"use client";

import { Button, Card, Chip } from "@heroui/react";
import { Check, Cup, Xmark } from "@gravity-ui/icons";
import type { Address, Account } from "@solana/kit";
import { RoundState, type Round, type Ticket } from "../../generated/lottery";
import { useClaimWinnings } from "../../lib/lottery/actions";
import {
  formatTokenAmount,
  useMint,
  useTokenSymbol,
} from "../../lib/lottery/tokens";
import { useConfig } from "../../lib/lottery/accounts";
import { isWinningTicket } from "../../lib/lottery/picks";

type TicketCardProps = {
  ticket: Account<Ticket>;
  /** When provided, the ticket is matched against this round's winning
   * numbers and a claim button is shown (if the round is settled and the
   * ticket won). Pass `undefined` for current/Open rounds — we'll just
   * render the picks without an outcome. */
  round?: { address: Address; data: Round };
};

function NumberBall(props: { value: number; isBonus?: boolean }) {
  const gradient = props.isBonus
    ? "bg-gradient-to-b from-foreground/80 to-foreground text-background"
    : "bg-gradient-to-b from-zinc-100 to-zinc-300 text-zinc-900 dark:from-zinc-700 dark:to-zinc-900 dark:text-zinc-50";
  return (
    <span
      className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${gradient}`}
    >
      {props.value}
    </span>
  );
}

export function TicketCard(props: TicketCardProps) {
  const { ticket, round } = props;
  const { config } = useConfig();
  const { decimals } = useMint(config?.paymentMint);
  const symbol = useTokenSymbol(config?.paymentMint);
  const claim = useClaimWinnings();

  const ticketIndex = Number(ticket.data.ticketIndex);
  const claimed = ticket.data.claimed;

  const outcome = round ? isWinningTicket(round.data, ticket.data) : null;
  const isSettled =
    round &&
    (round.data.state === RoundState.Claimable ||
      round.data.state === RoundState.Archived);

  const perComboPayout =
    outcome?.winning && round
      ? (round.data.perComboPayout?.[outcome.tier] ?? 0n)
      : 0n;
  const hasPayout = perComboPayout > 0n;
  const payoutLabel = hasPayout
    ? `${formatTokenAmount(perComboPayout, decimals, { maxDecimals: 2 })} ${symbol}`
    : null;

  // A winning ticket is "claimable" only when there's actually a payout for
  // its tier — empty pools can leave a winning tier at 0 USDC, in which case
  // there's nothing for the chain to transfer (and the chip says
  // "Match · No prize" instead of "Winner").
  const canClaim = !!(outcome?.winning && isSettled && !claimed && hasPayout);

  const handleClaim = async () => {
    if (!round) return;
    try {
      await claim.trigger({
        round: round.address,
        ticket: { address: ticket.address, data: ticket.data },
      });
    } catch {
      // surfaced via toast / lastError
    }
  };

  return (
    <Card variant={canClaim ? "secondary" : "default"} className="p-0 border">
      <Card.Content className="grid gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            Ticket #{ticketIndex + 1}
          </span>
          {claimed ? (
            <Chip size="sm" color="success" variant="secondary">
              <Check />
              <Chip.Label>Claimed</Chip.Label>
            </Chip>
          ) : outcome?.winning && isSettled && hasPayout ? (
            <Chip size="sm" color="success" variant="primary">
              <Cup />
              <Chip.Label>Winner</Chip.Label>
            </Chip>
          ) : outcome?.winning && isSettled ? (
            <Chip size="sm" color="default" variant="secondary">
              <Cup />
              <Chip.Label>Match · No prize</Chip.Label>
            </Chip>
          ) : isSettled ? (
            <Chip size="sm" color="default" variant="secondary">
              <Xmark />
              <Chip.Label>No win</Chip.Label>
            </Chip>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {Array.from(ticket.data.normals).map((n, i) => (
            <NumberBall key={i} value={n} />
          ))}
          <span className="px-1 text-sm font-semibold text-muted">+</span>
          <NumberBall value={ticket.data.bonusball} isBonus />
        </div>

        {outcome && isSettled && (
          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              {outcome.matches} match{outcome.matches === 1 ? "" : "es"}
              {outcome.hasBonusball ? " + bonus" : ""}
            </span>
            {outcome.winning && (
              <span
                className={
                  hasPayout
                    ? "font-semibold text-foreground"
                    : "font-semibold text-muted"
                }
              >
                {hasPayout ? payoutLabel : `0 ${symbol}`}
              </span>
            )}
          </div>
        )}

        {canClaim && (
          <Button
            variant="primary"
            size="sm"
            fullWidth
            isPending={claim.isPending}
            onPress={() => void handleClaim()}
          >
            Claim · {payoutLabel}
          </Button>
        )}
      </Card.Content>
    </Card>
  );
}
