"use client";

import { RoundState } from "../../../generated/lottery";
import { StatusBadge, type BadgeTone } from "./status-badge";

const STATE_LABELS: Record<RoundState, string> = {
  [RoundState.Open]: "Open",
  [RoundState.Drawing]: "Drawing",
  [RoundState.Claimable]: "Claimable",
  [RoundState.Archived]: "Archived",
  [RoundState.Emergency]: "Emergency",
};

const STATE_TONES: Record<RoundState, BadgeTone> = {
  [RoundState.Open]: "good",
  [RoundState.Drawing]: "info",
  [RoundState.Claimable]: "good",
  [RoundState.Archived]: "neutral",
  [RoundState.Emergency]: "bad",
};

export function roundStateName(state?: RoundState): string {
  return state == null ? "No round" : (STATE_LABELS[state] ?? "Unknown");
}

export function RoundStateBadge(props: { state?: RoundState }) {
  if (props.state == null)
    return <StatusBadge tone="neutral">No round</StatusBadge>;
  return (
    <StatusBadge tone={STATE_TONES[props.state]}>
      {STATE_LABELS[props.state]}
    </StatusBadge>
  );
}
