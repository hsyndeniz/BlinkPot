"use client";

import type { Address } from "@solana/kit";
import type { Subscription } from "../../../generated/lottery";
import { useCancelSubscription } from "../../../lib/lottery/actions";
import {
  ActionButton,
  AddressLink,
  Metric,
  MetricGrid,
  Panel,
  RelativeTime,
  StatusBadge,
  TokenAmount,
} from "../shared";

export function ActiveSubscriptionCard(props: {
  subscription: Subscription;
  paymentMint?: Address;
  decimals: number;
}) {
  const { subscription, paymentMint, decimals } = props;
  const cancel = useCancelSubscription();

  return (
    <Panel
      title="Active subscription"
      description={
        <span className="flex items-center gap-2">
          <StatusBadge tone={subscription.active ? "good" : "warn"}>
            {subscription.active ? "Active" : "Inactive"}
          </StatusBadge>
          {subscription.hasReferrer && (
            <span className="text-xs">
              ref: <AddressLink address={subscription.referrer} />
            </span>
          )}
        </span>
      }
      action={
        <ActionButton
          variant="danger"
          size="sm"
          disabled={subscription.escrowBalance === 0n && !subscription.active}
          isPending={cancel.isPending}
          onClick={() => void cancel.trigger().catch(() => {})}
        >
          Cancel
        </ActionButton>
      }
    >
      <MetricGrid columns={3}>
        <Metric
          label="Daily tickets"
          value={subscription.dailyTicketCount.toString()}
        />
        <Metric label="Days remaining" value={subscription.remainingDays} />
        <Metric
          label="Agreed price"
          value={
            <TokenAmount
              amount={subscription.agreedPrice}
              decimals={decimals}
              mint={paymentMint}
              showSymbol={false}
            />
          }
        />
        <Metric
          label="Escrow balance"
          value={
            <TokenAmount
              amount={subscription.escrowBalance}
              decimals={decimals}
              mint={paymentMint}
              showSymbol={false}
            />
          }
        />
        <Metric
          label="Last processed"
          value={
            subscription.lastProcessedRound > 0n
              ? `#${subscription.lastProcessedRound.toString()}`
              : "—"
          }
        />
        <Metric
          label="Expires"
          value={
            <RelativeTime
              unixSeconds={subscription.expiresAt}
              showAbsolute={false}
              fallback="—"
            />
          }
        />
      </MetricGrid>
      {cancel.lastError && (
        <p className="mt-3 text-xs text-destructive">{cancel.lastError}</p>
      )}
    </Panel>
  );
}
