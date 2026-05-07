"use client";

import type { Address } from "@solana/kit";
import { RoundState, type Round, type Ticket } from "../../../generated/lottery";
import { useClaimWinnings } from "../../../lib/lottery/actions";
import { isWinningTicket, tierLabel } from "../../../lib/lottery/picks";
import {
  ActionButton,
  AddressLink,
  BallStrip,
  StatusBadge,
  TokenAmount,
} from "../shared";

export function TicketRow(props: {
  ticket: { address: Address; data: Ticket };
  round: Round | undefined;
  roundAddress: Address | undefined;
  paymentMint?: Address;
  decimals: number;
  pickCount?: number;
}) {
  const { ticket, round, roundAddress, paymentMint, decimals, pickCount } = props;
  const claim = useClaimWinnings();

  const isClaimable =
    !!round &&
    (round.state === RoundState.Claimable ||
      round.state === RoundState.Archived);
  const result = round ? isWinningTicket(round, ticket.data) : undefined;
  const tier = result?.tier ?? 0;
  const isWinning = result?.winning ?? false;
  const perCombo =
    result && round && round.perComboPayout?.[result.tier]
      ? round.perComboPayout[result.tier]
      : 0n;
  const exactPayout =
    pickCount && pickCount > 0 ? perCombo / BigInt(pickCount) : undefined;

  const canClaim =
    isClaimable && isWinning && !ticket.data.claimed && !!roundAddress;

  return (
    <div className="grid gap-2 rounded-md border border-border-low bg-background/40 px-3 py-2 text-xs sm:grid-cols-[auto_1fr_auto] sm:items-center">
      <span className="font-mono">#{ticket.data.ticketIndex.toString()}</span>
      <div className="flex flex-wrap items-center gap-3">
        <BallStrip
          normals={ticket.data.normals}
          bonusball={ticket.data.bonusball}
          winningNormals={round?.winningNormals}
          winningBonusball={round?.winningBonusball}
        />
        {round && (
          <StatusBadge
            tone={isWinning ? "good" : "neutral"}
            className="!text-[10px]"
          >
            tier {tier}{" "}
            {(() => {
              const lbl = tierLabel(tier);
              return `(${lbl.matches}N${lbl.hasBonus ? "+B" : ""})`;
            })()}
          </StatusBadge>
        )}
        {ticket.data.claimed && (
          <StatusBadge tone="neutral" className="!text-[10px]">
            claimed
          </StatusBadge>
        )}
        {ticket.data.hasReferrer && (
          <span className="text-muted">
            ref: <AddressLink address={ticket.data.referrer} />
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 text-right">
        <span className="grid">
          <span className="text-muted">Paid</span>
          <TokenAmount
            amount={ticket.data.pricePaid}
            decimals={decimals}
            mint={paymentMint}
            showSymbol={false}
          />
        </span>
        {isWinning && (
          <span className="grid">
            <span className="text-muted">
              {exactPayout != null ? "Payout" : "≤ payout"}
            </span>
            <TokenAmount
              amount={exactPayout ?? perCombo}
              decimals={decimals}
              mint={paymentMint}
              showSymbol={false}
            />
            {pickCount != null && (
              <span className="text-[10px] text-muted">
                shared by {pickCount}
              </span>
            )}
          </span>
        )}
        {canClaim && (
          <ActionButton
            variant="primary"
            size="sm"
            isPending={claim.isPending}
            onClick={() => {
              if (!roundAddress) return;
              void claim
                .trigger({ round: roundAddress, ticket })
                .catch(() => {});
            }}
          >
            Claim
          </ActionButton>
        )}
      </div>
    </div>
  );
}
