"use client";

import {
  useConfig,
  useCurrentRound,
  useLpPosition,
  useLpVault,
} from "../../../lib/lottery/accounts";
import { useWallet } from "../../../lib/wallet/context";
import { useMint } from "../../../lib/lottery/tokens";
import { Panel, PanelGroup } from "../shared";
import { LpDepositForm } from "./lp-deposit-form";
import { LpFinalizeWithdrawCta } from "./lp-finalize-withdraw-cta";
import { LpInitiateWithdrawForm } from "./lp-initiate-withdraw-form";
import { LpPositionCard } from "./lp-position-card";
import { LpVaultStrip } from "./lp-vault-strip";

export function LpPanel() {
  const { signer, wallet } = useWallet();
  const walletAddress = signer?.address ?? wallet?.account.address;
  const { config } = useConfig();
  const { decimals } = useMint(config?.paymentMint);
  const { lpVault } = useLpVault();
  const position = useLpPosition(walletAddress);
  const { currentRoundId } = useCurrentRound();

  return (
    <PanelGroup>
      <Panel title="LP vault">
        <LpVaultStrip
          lpVault={lpVault}
          paymentMint={config?.paymentMint}
          decimals={decimals}
        />
      </Panel>
      <Panel title="Your position">
        <LpPositionCard
          position={position.position}
          lpVault={lpVault}
          currentRoundId={currentRoundId}
          paymentMint={config?.paymentMint}
          decimals={decimals}
        />
      </Panel>
      <LpDepositForm />
      <LpInitiateWithdrawForm />
      <LpFinalizeWithdrawCta />
    </PanelGroup>
  );
}
