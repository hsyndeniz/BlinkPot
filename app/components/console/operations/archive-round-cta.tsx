"use client";

import { RoundState } from "../../../generated/lottery";
import { useConfig, useCurrentRound } from "../../../lib/lottery/accounts";
import { useIsAdmin } from "../../../lib/lottery/admin";
import { useArchiveRound } from "../../../lib/lottery/actions";
import { ActionButton, Panel, StatusBadge } from "../shared";

export function ArchiveRoundCta() {
  const { config } = useConfig();
  const { round, address } = useCurrentRound();
  const isAdmin = useIsAdmin();
  const archive = useArchiveRound();

  const canArchive =
    !!config &&
    !config.paused &&
    !config.emergencyMode &&
    !!round &&
    round.state === RoundState.Claimable &&
    !!address;

  return (
    <Panel
      title="Archive round"
      description={
        !round ? (
          <StatusBadge tone="warn">No round to archive.</StatusBadge>
        ) : round.state !== RoundState.Claimable ? (
          <StatusBadge tone="warn">
            Archiving requires the round to be Claimable.
          </StatusBadge>
        ) : !isAdmin ? (
          <StatusBadge tone="bad">Admin only</StatusBadge>
        ) : (
          <span>
            Sweep leftover prize budget per untaken_tier_destination and move
            the round to Archived.
          </span>
        )
      }
      action={
        <ActionButton
          variant="primary"
          size="sm"
          disabled={!isAdmin || !canArchive}
          isPending={archive.isPending}
          onClick={() => {
            if (!round || !address) return;
            void archive
              .trigger({ round: address, roundId: round.roundId })
              .catch(() => {});
          }}
        >
          Archive
        </ActionButton>
      }
    >
      {archive.lastError && (
        <p className="text-xs text-destructive">{archive.lastError}</p>
      )}
    </Panel>
  );
}
