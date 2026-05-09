"use client";

import { Alert, Button, Card, Chip, Surface } from "@heroui/react";
import {
  ArrowsRotateRight,
  Calendar,
  CircleDollar,
  Ticket,
} from "@gravity-ui/icons";
import { useConfig, useSubscription } from "../../lib/lottery/accounts";
import { useCancelSubscription } from "../../lib/lottery/actions";
import {
  formatTokenAmount,
  useMint,
  useTokenSymbol,
} from "../../lib/lottery/tokens";
import { useWallet } from "../../lib/wallet/context";
import { classifyError } from "../../lib/errors/classify";

function Stat(props: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <span className="flex items-center gap-1 text-xs uppercase tracking-wider text-muted">
        {props.icon}
        {props.label}
      </span>
      <span className="text-base font-semibold tabular-nums">
        {props.value}
      </span>
    </div>
  );
}

export function SubscriptionStatusCard() {
  const { signer, wallet } = useWallet();
  const walletAddress = signer?.address ?? wallet?.account.address;
  const { config } = useConfig();
  const { decimals } = useMint(config?.paymentMint);
  const symbol = useTokenSymbol(config?.paymentMint);
  const { subscription } = useSubscription(walletAddress);
  const cancel = useCancelSubscription();

  if (!subscription || !subscription.active) return null;

  const fmt = (v: bigint) =>
    `${formatTokenAmount(v, decimals, { maxDecimals: 2 })} ${symbol}`;

  const expiresAt = new Date(Number(subscription.expiresAt) * 1000);
  const expiresLabel = Number.isFinite(expiresAt.getTime())
    ? expiresAt.toLocaleString()
    : "—";

  const error = cancel.lastError ? classifyError(cancel.lastError) : null;

  const handleCancel = async () => {
    try {
      await cancel.trigger();
    } catch {
      // surfaced via toast / alert
    }
  };

  return (
    <Card className="w-full">
      <Card.Content className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Surface
              variant="default"
              className="flex size-8 items-center justify-center rounded-full"
            >
              <ArrowsRotateRight className="size-4 text-success" />
            </Surface>
            <div className="grid">
              <span className="text-sm font-semibold">Active subscription</span>
              <span className="text-xs text-muted">Auto-buy each round</span>
            </div>
          </div>
          <Chip size="sm" color="success" variant="primary">
            <Chip.Label>Active</Chip.Label>
          </Chip>
        </div>

        <Surface
          variant="secondary"
          className="grid grid-cols-3 gap-3 rounded-2xl p-3"
        >
          <Stat
            icon={<Ticket className="size-3" />}
            label="Per day"
            value={String(subscription.dailyTicketCount)}
          />
          <Stat
            icon={<Calendar className="size-3" />}
            label="Days left"
            value={String(subscription.remainingDays)}
          />
          <Stat
            icon={<CircleDollar className="size-3" />}
            label="Escrow"
            value={fmt(subscription.escrowBalance)}
          />
        </Surface>

        <p className="text-xs text-muted">
          Locked-in price{" "}
          <span className="font-semibold text-foreground">
            {fmt(subscription.agreedPrice)}
          </span>{" "}
          per ticket · expires{" "}
          <span className="font-semibold text-foreground">{expiresLabel}</span>
        </p>

        <Button
          variant="danger-soft"
          size="sm"
          isPending={cancel.isPending}
          onPress={() => void handleCancel()}
        >
          Cancel subscription · refund {fmt(subscription.escrowBalance)}
        </Button>

        {error && cancel.lastError && (
          <Alert status={error.status}>
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{error.title}</Alert.Title>
              <Alert.Description>{cancel.lastError}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}
      </Card.Content>
    </Card>
  );
}
