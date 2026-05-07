"use client";

import {
  useCurrentRound,
  useLpPosition,
} from "../../../lib/lottery/accounts";
import { useWallet } from "../../../lib/wallet/context";
import { useLpFinalizeWithdraw } from "../../../lib/lottery/actions";
import { ActionButton, Panel, StatusBadge } from "../shared";

export function LpFinalizeWithdrawCta() {
  const { signer, wallet } = useWallet();
  const walletAddress = signer?.address ?? wallet?.account.address;
  const position = useLpPosition(walletAddress);
  const { currentRoundId } = useCurrentRound();
  const finalize = useLpFinalizeWithdraw();

  const noPending = !position.position?.pendingWithdrawShares;
  const eligible =
    !!position.position &&
    position.position.pendingWithdrawShares > 0n &&
    currentRoundId != null &&
    currentRoundId > position.position.pendingWithdrawRound;

  return (
    <Panel
      title="Finalize withdraw"
      description={
        noPending ? (
          <StatusBadge tone="neutral">No pending withdrawal.</StatusBadge>
        ) : eligible ? (
          <StatusBadge tone="good">
            Eligible — your pending round has terminated.
          </StatusBadge>
        ) : (
          <StatusBadge tone="warn">
            Cooldown active — wait for round #
            {position.position?.pendingWithdrawRound.toString()} to terminate.
          </StatusBadge>
        )
      }
      action={
        <ActionButton
          variant="primary"
          size="sm"
          disabled={!eligible}
          isPending={finalize.isPending}
          onClick={() => void finalize.trigger().catch(() => {})}
        >
          Finalize
        </ActionButton>
      }
    >
      {finalize.lastError && (
        <p className="text-xs text-destructive">{finalize.lastError}</p>
      )}
    </Panel>
  );
}
