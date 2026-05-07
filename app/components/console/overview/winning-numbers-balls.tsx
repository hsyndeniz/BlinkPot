"use client";

import { RoundState, type Round } from "../../../generated/lottery";
import { BallStrip, EmptyState } from "../shared";

export function WinningNumbersBalls(props: { round: Round | undefined }) {
  const { round } = props;
  if (!round)
    return <EmptyState description="No round selected." />;

  if (
    round.state !== RoundState.Claimable &&
    round.state !== RoundState.Archived
  ) {
    return (
      <EmptyState
        title="Awaiting draw"
        description="Winning numbers appear once the draw has been revealed."
      />
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-xs text-muted">Winning numbers</p>
      <BallStrip
        normals={round.winningNormals}
        bonusball={round.winningBonusball}
      />
    </div>
  );
}
