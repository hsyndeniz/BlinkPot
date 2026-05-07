"use client";

import { useConfig, useLpPosition } from "../../../lib/lottery/accounts";
import { useEmergencyLpWithdraw } from "../../../lib/lottery/actions";
import { useWallet } from "../../../lib/wallet/context";
import { ActionButton, Panel, StatusBadge } from "../shared";

export function EmergencyLpWithdrawCta() {
  const { signer, wallet } = useWallet();
  const walletAddress = signer?.address ?? wallet?.account.address;
  const { config } = useConfig();
  const position = useLpPosition(walletAddress);
  const exit = useEmergencyLpWithdraw();

  const enabled = !!config?.emergencyMode;
  const hasShares =
    !!position.position &&
    (position.position.shares > 0n ||
      position.position.pendingWithdrawShares > 0n);

  return (
    <Panel
      title="Emergency LP exit"
      description={
        !enabled ? (
          <StatusBadge tone="neutral">
            Available only when global emergency mode is active.
          </StatusBadge>
        ) : !hasShares ? (
          <StatusBadge tone="neutral">No LP shares to withdraw.</StatusBadge>
        ) : (
          <span>
            Pays out{" "}
            <span className="font-mono">
              min(assets_for_shares, lp_principal.amount)
            </span>{" "}
            for active + pending shares and zeroes the position.
          </span>
        )
      }
      action={
        <ActionButton
          variant="danger"
          size="sm"
          disabled={!enabled || !hasShares}
          isPending={exit.isPending}
          onClick={() => void exit.trigger().catch(() => {})}
        >
          Emergency exit
        </ActionButton>
      }
    >
      {exit.lastError && (
        <p className="text-xs text-destructive">{exit.lastError}</p>
      )}
    </Panel>
  );
}
