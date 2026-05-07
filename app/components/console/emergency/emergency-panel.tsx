"use client";

import { RoundState } from "../../../generated/lottery";
import {
  useConfig,
  useCurrentRound,
  useTickets,
} from "../../../lib/lottery/accounts";
import { useWallet } from "../../../lib/wallet/context";
import { useMint } from "../../../lib/lottery/tokens";
import {
  EmptyState,
  Panel,
  PanelGroup,
  Skeleton,
  StatusBadge,
} from "../shared";
import { EmergencyLpWithdrawCta } from "./emergency-lp-withdraw-cta";
import { EmergencyRefundTicketRow } from "./emergency-refund-ticket-row";

export function EmergencyPanel() {
  const { signer, wallet } = useWallet();
  const walletAddress = signer?.address ?? wallet?.account.address;
  const { config } = useConfig();
  const { decimals } = useMint(config?.paymentMint);
  const { round, address: roundAddress } = useCurrentRound();
  const tickets = useTickets(round?.roundId, walletAddress);

  const roundEmergency = round?.state === RoundState.Emergency;
  const globalEmergency = !!config?.emergencyMode;

  return (
    <PanelGroup>
      <Panel
        title="Emergency tools"
        description={
          <span className="flex items-center gap-2">
            <StatusBadge tone={globalEmergency ? "bad" : "neutral"}>
              global: {globalEmergency ? "ON" : "OFF"}
            </StatusBadge>
            <StatusBadge tone={roundEmergency ? "bad" : "neutral"}>
              round: {roundEmergency ? "EMERGENCY" : "normal"}
            </StatusBadge>
          </span>
        }
      >
        <p className="text-xs text-muted">
          Emergency refunds are available when the round is in Emergency state.
          Refunds first draw from prize_vault and fall back to lp_principal for
          the shortfall.
        </p>
      </Panel>

      <Panel title="Refund tickets">
        {!walletAddress ? (
          <EmptyState description="Connect a wallet to refund tickets." />
        ) : !roundEmergency ? (
          <EmptyState description="The current round is not in Emergency state." />
        ) : tickets.isLoading ? (
          <Skeleton rows={3} />
        ) : tickets.tickets.length === 0 ? (
          <EmptyState description="No tickets to refund for this round." />
        ) : (
          <div className="grid gap-2">
            {tickets.tickets.map((t) => (
              <EmergencyRefundTicketRow
                key={t.address}
                round={roundAddress}
                ticket={t}
                paymentMint={config?.paymentMint}
                decimals={decimals}
              />
            ))}
          </div>
        )}
      </Panel>

      <EmergencyLpWithdrawCta />
    </PanelGroup>
  );
}
