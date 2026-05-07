"use client";

import { useConfig, useReferral } from "../../../lib/lottery/accounts";
import { useClaimReferralFees } from "../../../lib/lottery/actions";
import { useWallet } from "../../../lib/wallet/context";
import { useMint } from "../../../lib/lottery/tokens";
import {
  ActionButton,
  AddressLink,
  EmptyState,
  Metric,
  MetricGrid,
  Panel,
  PanelGroup,
  StatusBadge,
  TokenAmount,
} from "../shared";
import { InitializeReferralForm } from "./initialize-referral-form";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";

export function ReferralPanel() {
  const { signer, wallet } = useWallet();
  const walletAddress = signer?.address ?? wallet?.account.address;
  const { config } = useConfig();
  const { decimals } = useMint(config?.paymentMint);
  const referral = useReferral(walletAddress);
  const claim = useClaimReferralFees();

  if (!walletAddress) {
    return (
      <Panel title="Referral">
        <EmptyState description="Connect a wallet to view your referral state." />
      </Panel>
    );
  }

  if (!referral.exists) {
    return (
      <PanelGroup>
        <Panel title="Referral">
          <EmptyState
            title="No referral PDA"
            description="Create your referral PDA to start accruing fees from buys you refer."
          />
        </Panel>
        <InitializeReferralForm />
      </PanelGroup>
    );
  }

  const data = referral.referral!;
  const hasParent =
    data.hasParent && data.parentReferrer.toString() !== SYSTEM_PROGRAM;

  return (
    <PanelGroup>
      <Panel
        title="Your referral"
        description={
          <span className="flex items-center gap-2">
            <AddressLink address={referral.address} showCopy />
            {hasParent && (
              <span className="text-xs text-muted">
                · parent: <AddressLink address={data.parentReferrer} />
              </span>
            )}
          </span>
        }
        action={
          <ActionButton
            variant="primary"
            size="sm"
            disabled={data.accrued === 0n}
            isPending={claim.isPending}
            onClick={() => void claim.trigger().catch(() => {})}
          >
            Claim fees
          </ActionButton>
        }
      >
        <MetricGrid columns={3}>
          <Metric
            label="Claimable"
            value={
              <TokenAmount
                amount={data.accrued}
                decimals={decimals}
                mint={config?.paymentMint}
                showSymbol={false}
              />
            }
            tone={data.accrued > 0n ? "good" : "neutral"}
          />
          <Metric
            label="Lifetime first-order"
            value={
              <TokenAmount
                amount={data.lifetimeEarnedFirst}
                decimals={decimals}
                mint={config?.paymentMint}
                showSymbol={false}
              />
            }
            subvalue="Direct referrals"
          />
          <Metric
            label="Lifetime second-order"
            value={
              <TokenAmount
                amount={data.lifetimeEarnedSecond}
                decimals={decimals}
                mint={config?.paymentMint}
                showSymbol={false}
              />
            }
            subvalue="Through downstream chain"
          />
        </MetricGrid>
        {!hasParent && (
          <p className="mt-3 text-xs text-muted">
            <StatusBadge tone="neutral">No parent referrer</StatusBadge> — you
            are at the top of your referral chain.
          </p>
        )}
        {claim.lastError && (
          <p className="mt-3 text-xs text-destructive">{claim.lastError}</p>
        )}
      </Panel>
    </PanelGroup>
  );
}
