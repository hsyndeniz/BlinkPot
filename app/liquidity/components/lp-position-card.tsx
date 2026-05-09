"use client";

import {
  Alert,
  Button,
  Card,
  Chip,
  Surface,
} from "@heroui/react";
import {
  ChartBar,
  CircleDollar,
  Clock,
  ShieldCheck,
} from "@gravity-ui/icons";
import type { Address } from "@solana/kit";
import {
  useConfig,
  useCurrentRound,
  useLpPosition,
  useLpVault,
} from "../../lib/lottery/accounts";
import {
  useEmergencyLpWithdraw,
  useLpFinalizeWithdraw,
} from "../../lib/lottery/actions";
import {
  formatTokenAmount,
  useMint,
  useTokenSymbol,
} from "../../lib/lottery/tokens";
import { classifyError } from "../../lib/errors/classify";
import { assetsForShares } from "../_lp-math";

function Stat(props: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-1">
      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        {props.icon}
        {props.label}
      </span>
      <span className="text-base font-semibold tabular-nums">
        {props.value}
      </span>
    </div>
  );
}

export function LpPositionCard(props: { walletAddress: Address }) {
  const { config } = useConfig();
  const { decimals } = useMint(config?.paymentMint);
  const symbol = useTokenSymbol(config?.paymentMint);
  const { lpVault } = useLpVault();
  const { position } = useLpPosition(props.walletAddress);
  const { currentRoundId } = useCurrentRound();

  const finalize = useLpFinalizeWithdraw();
  const emergencyExit = useEmergencyLpWithdraw();

  const fmt = (v: bigint) =>
    `${formatTokenAmount(v, decimals, { maxDecimals: 2 })} ${symbol}`;

  const shares = position?.shares ?? 0n;
  const pendingShares = position?.pendingWithdrawShares ?? 0n;
  const pendingRound = position?.pendingWithdrawRound ?? 0n;
  const totalShares = lpVault?.totalShares ?? 0n;
  const totalAssets = lpVault?.totalAssets ?? 0n;
  const value = assetsForShares(shares, totalShares, totalAssets);
  const pendingValue = assetsForShares(
    pendingShares,
    totalShares,
    totalAssets
  );

  const lastDepositSec = position ? Number(position.lastDepositAt) : 0;
  const lastDepositLabel =
    lastDepositSec > 0
      ? new Date(lastDepositSec * 1000).toLocaleDateString()
      : "—";

  const hasPosition = shares > 0n || pendingShares > 0n;
  const hasPending = pendingShares > 0n;
  const isReadyToFinalize =
    hasPending &&
    currentRoundId != null &&
    currentRoundId > pendingRound;

  const finalizeError = finalize.lastError
    ? classifyError(finalize.lastError)
    : null;
  const emergencyError = emergencyExit.lastError
    ? classifyError(emergencyExit.lastError)
    : null;

  const handleFinalize = async () => {
    try {
      await finalize.trigger();
    } catch {
      // surfaced via toast / alert
    }
  };

  const handleEmergency = async () => {
    try {
      await emergencyExit.trigger();
    } catch {
      // surfaced via toast / alert
    }
  };

  if (!hasPosition) {
    return (
      <Card className="w-full">
        <Card.Content className="grid gap-2 py-6 text-center">
          <span className="text-sm font-semibold">No LP position yet</span>
          <p className="text-xs text-muted">
            Deposit on the right to mint LP shares — you&apos;ll start earning
            the edge from the next round.
          </p>
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <Card.Content className="grid gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted" />
          <span className="text-sm font-semibold">Your position</span>
        </div>

        <Surface
          variant="secondary"
          className="grid gap-1 rounded-2xl p-4 text-center"
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted">
            Position value
          </span>
          <p className="bg-gradient-to-br from-foreground via-foreground/85 to-foreground/50 bg-clip-text text-transparent text-3xl font-black tabular-nums tracking-tighter sm:text-4xl">
            {fmt(value)}
          </p>
        </Surface>

        <Surface
          variant="default"
          className="grid grid-cols-2 gap-3 rounded-2xl p-3"
        >
          <Stat
            icon={<ChartBar className="size-3" />}
            label="Shares"
            value={shares.toString()}
          />
          <Stat
            icon={<CircleDollar className="size-3" />}
            label="Last deposit"
            value={lastDepositLabel}
          />
        </Surface>

        {hasPending && (
          <Surface variant="default" className="grid gap-2 rounded-2xl p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold">
                <Clock className="size-3 text-warning" />
                Pending withdraw
              </span>
              <Chip
                size="sm"
                color={isReadyToFinalize ? "success" : "warning"}
                variant="primary"
              >
                <Chip.Label>
                  {isReadyToFinalize
                    ? "Ready"
                    : `Wait for round #${(pendingRound + 1n).toString()}`}
                </Chip.Label>
              </Chip>
            </div>
            <div className="flex items-center justify-between text-xs text-muted">
              <span>{pendingShares.toString()} shares queued</span>
              <span className="font-semibold text-foreground">
                {fmt(pendingValue)}
              </span>
            </div>
            <Button
              variant="primary"
              size="sm"
              fullWidth
              isPending={finalize.isPending}
              isDisabled={!isReadyToFinalize}
              onPress={() => void handleFinalize()}
            >
              {isReadyToFinalize
                ? `Finalize · ${fmt(pendingValue)}`
                : "Cooldown in progress"}
            </Button>
            {finalizeError && finalize.lastError && (
              <Alert status={finalizeError.status}>
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>{finalizeError.title}</Alert.Title>
                  <Alert.Description>{finalize.lastError}</Alert.Description>
                </Alert.Content>
              </Alert>
            )}
          </Surface>
        )}

        {config?.emergencyMode && (
          <Surface
            variant="default"
            className="grid gap-2 rounded-2xl border border-danger/30 p-3"
          >
            <span className="text-xs font-semibold text-danger">
              Emergency mode is active
            </span>
            <p className="text-xs text-muted">
              You can exit immediately and skip the cooldown — burns all your
              shares and refunds principal pro-rata.
            </p>
            <Button
              variant="danger-soft"
              size="sm"
              fullWidth
              isPending={emergencyExit.isPending}
              onPress={() => void handleEmergency()}
            >
              Emergency LP withdraw
            </Button>
            {emergencyError && emergencyExit.lastError && (
              <Alert status={emergencyError.status}>
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>{emergencyError.title}</Alert.Title>
                  <Alert.Description>
                    {emergencyExit.lastError}
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            )}
          </Surface>
        )}
      </Card.Content>
    </Card>
  );
}
