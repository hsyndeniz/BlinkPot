"use client";

import { Alert, Button, Card, Surface } from "@heroui/react";
import { CircleDollar, Cup, Persons } from "@gravity-ui/icons";
import type { Address } from "@solana/kit";
import type { Referral } from "../../generated/lottery";
import { useConfig } from "../../lib/lottery/accounts";
import { useClaimReferralFees } from "../../lib/lottery/actions";
import {
  formatTokenAmount,
  useMint,
  useTokenSymbol,
} from "../../lib/lottery/tokens";
import { ellipsify } from "../../lib/explorer";
import { classifyError } from "../../lib/errors/classify";

export function ReferralRewardsCard(props: {
  referral: Referral;
  walletAddress: Address;
}) {
  const { referral } = props;
  const { config } = useConfig();
  const { decimals } = useMint(config?.paymentMint);
  const symbol = useTokenSymbol(config?.paymentMint);
  const claim = useClaimReferralFees();

  const fmt = (v: bigint) =>
    `${formatTokenAmount(v, decimals, { maxDecimals: 2 })} ${symbol}`;

  const accrued = referral.accrued;
  const lifetimeFirst = referral.lifetimeEarnedFirst;
  const lifetimeSecond = referral.lifetimeEarnedSecond;
  const lifetimeTotal = lifetimeFirst + lifetimeSecond;

  const error = claim.lastError ? classifyError(claim.lastError) : null;

  const handleClaim = async () => {
    try {
      await claim.trigger();
    } catch {
      // surfaced via toast / alert
    }
  };

  return (
    <Card className="w-full">
      <Card.Content className="grid gap-3">
        <div className="flex items-center gap-2">
          <Cup className="size-4 text-muted" />
          <span className="text-sm font-semibold">Rewards</span>
        </div>

        <Surface
          variant="secondary"
          className="grid gap-2 rounded-2xl p-4 text-center"
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted">
            Claimable now
          </span>
          <p className="bg-gradient-to-br from-foreground via-foreground/85 to-foreground/50 bg-clip-text text-transparent text-4xl font-black tabular-nums tracking-tighter sm:text-5xl">
            {fmt(accrued)}
          </p>
        </Surface>

        <Button
          variant="primary"
          fullWidth
          isPending={claim.isPending}
          isDisabled={accrued === 0n}
          onPress={() => void handleClaim()}
        >
          {accrued === 0n ? "Nothing to claim yet" : `Claim · ${fmt(accrued)}`}
        </Button>

        <div className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            Lifetime earnings
          </span>
          <Surface
            variant="default"
            className="grid grid-cols-2 gap-3 rounded-2xl p-3"
          >
            <div className="grid gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                Direct
              </span>
              <span className="text-base font-semibold tabular-nums">
                {fmt(lifetimeFirst)}
              </span>
            </div>
            <div className="grid gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                Indirect
              </span>
              <span className="text-base font-semibold tabular-nums">
                {fmt(lifetimeSecond)}
              </span>
            </div>
          </Surface>
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Total earned all-time</span>
            <span className="font-semibold text-foreground">
              {fmt(lifetimeTotal)}
            </span>
          </div>
        </div>

        {referral.hasParent && (
          <div className="flex items-center justify-between text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <Persons className="size-3" />
              Your referrer
            </span>
            <span className="font-mono">
              {ellipsify(referral.parentReferrer, 4)}
            </span>
          </div>
        )}

        {!referral.hasParent && (
          <div className="flex items-center justify-between text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <CircleDollar className="size-3" />
              Top of chain
            </span>
            <span>No upstream referrer</span>
          </div>
        )}

        {error && claim.lastError && (
          <Alert status={error.status}>
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{error.title}</Alert.Title>
              <Alert.Description>{claim.lastError}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}
      </Card.Content>
    </Card>
  );
}
