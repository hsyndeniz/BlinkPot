"use client";

import type { Address } from "@solana/kit";
import type { Ticket } from "../../../generated/lottery";
import { useEmergencyRefundTicket } from "../../../lib/lottery/actions";
import {
  ActionButton,
  BallStrip,
  StatusBadge,
  TokenAmount,
} from "../shared";

export function EmergencyRefundTicketRow(props: {
  round: Address | undefined;
  ticket: { address: Address; data: Ticket };
  paymentMint?: Address;
  decimals: number;
}) {
  const refund = useEmergencyRefundTicket();
  const { ticket, round, paymentMint, decimals } = props;

  return (
    <div className="grid gap-2 rounded-md border border-border-low bg-background/40 px-3 py-2 text-xs sm:grid-cols-[auto_1fr_auto] sm:items-center">
      <span className="font-mono">#{ticket.data.ticketIndex.toString()}</span>
      <div className="flex flex-wrap items-center gap-3">
        <BallStrip
          normals={ticket.data.normals}
          bonusball={ticket.data.bonusball}
        />
        {ticket.data.claimed && (
          <StatusBadge tone="neutral" className="!text-[10px]">
            already claimed
          </StatusBadge>
        )}
      </div>
      <div className="flex items-center gap-3 text-right">
        <span className="grid">
          <span className="text-muted">Refund</span>
          <TokenAmount
            amount={ticket.data.pricePaid}
            decimals={decimals}
            mint={paymentMint}
            showSymbol={false}
          />
        </span>
        <ActionButton
          variant="primary"
          size="sm"
          disabled={ticket.data.claimed || !round}
          isPending={refund.isPending}
          onClick={() => {
            if (!round) return;
            void refund.trigger({ round, ticket }).catch(() => {});
          }}
        >
          Refund
        </ActionButton>
      </div>
    </div>
  );
}
