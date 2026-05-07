"use client";

import { useConfig, useSubscription } from "../../../lib/lottery/accounts";
import { useWallet } from "../../../lib/wallet/context";
import { useMint } from "../../../lib/lottery/tokens";
import { EmptyState, Panel, PanelGroup } from "../shared";
import { ActiveSubscriptionCard } from "./active-subscription-card";
import { CreateSubscriptionForm } from "./create-subscription-form";
import { KeeperProcessForm } from "./keeper-process-form";

export function SubscriptionPanel() {
  const { signer, wallet } = useWallet();
  const walletAddress = signer?.address ?? wallet?.account.address;
  const { config } = useConfig();
  const { decimals } = useMint(config?.paymentMint);
  const subscription = useSubscription(walletAddress);

  if (!walletAddress) {
    return (
      <Panel title="Subscription">
        <EmptyState description="Connect a wallet to manage subscriptions." />
      </Panel>
    );
  }

  return (
    <PanelGroup>
      {subscription.subscription?.initialized ? (
        <ActiveSubscriptionCard
          subscription={subscription.subscription}
          paymentMint={config?.paymentMint}
          decimals={decimals}
        />
      ) : (
        <CreateSubscriptionForm />
      )}
      <KeeperProcessForm />
    </PanelGroup>
  );
}
