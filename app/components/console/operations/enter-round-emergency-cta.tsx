"use client";

import { RoundState } from "../../../generated/lottery";
import { useCurrentRound } from "../../../lib/lottery/accounts";
import { useIsAdmin } from "../../../lib/lottery/admin";
import { useEnterRoundEmergency } from "../../../lib/lottery/actions";
import { ActionButton, Panel, StatusBadge } from "../shared";

export function EnterRoundEmergencyCta() {
  const { round, address } = useCurrentRound();
  const isAdmin = useIsAdmin();
  const enter = useEnterRoundEmergency();

  const blocked =
    !round ||
    round.state === RoundState.Claimable ||
    round.state === RoundState.Archived ||
    round.state === RoundState.Emergency;

  return (
    <Panel
      title="Enter round emergency"
      description={
        !isAdmin ? (
          <StatusBadge tone="bad">Admin only</StatusBadge>
        ) : blocked ? (
          <StatusBadge tone="warn">
            Round is already terminal or has no emergency entry path.
          </StatusBadge>
        ) : (
          <span>
            Move the round to Emergency state and refund the LP guarantee from
            prize_vault → lp_principal so emergency_lp_withdraw stays solvent.
          </span>
        )
      }
      action={
        <ActionButton
          variant="danger"
          size="sm"
          disabled={!isAdmin || blocked}
          isPending={enter.isPending}
          onClick={() => {
            if (!address) return;
            void enter.trigger({ round: address }).catch(() => {});
          }}
        >
          Enter emergency
        </ActionButton>
      }
    >
      {enter.lastError && (
        <p className="text-xs text-destructive">{enter.lastError}</p>
      )}
    </Panel>
  );
}
