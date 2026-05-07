"use client";

import { useConfig } from "../../../lib/lottery/accounts";
import { useIsAdmin } from "../../../lib/lottery/admin";
import {
  useSetEmergencyMode,
  useSetPaused,
} from "../../../lib/lottery/actions";
import { ActionButton, EmptyState, Panel, StatusBadge } from "../shared";

export function PauseEmergencyToggles() {
  const { config } = useConfig();
  const isAdmin = useIsAdmin();
  const setPaused = useSetPaused();
  const setEmergency = useSetEmergencyMode();

  if (!config)
    return (
      <Panel title="Operational toggles">
        <EmptyState description="Initialize config first." />
      </Panel>
    );

  return (
    <Panel
      title="Operational toggles"
      description={
        !isAdmin ? <StatusBadge tone="bad">Admin only</StatusBadge> : undefined
      }
    >
      <div className="grid gap-3">
        <Row
          label="Pause"
          description="Blocks all state-mutating actions while paused."
          enabled={config.paused}
          isPending={setPaused.isPending}
          disabled={!isAdmin}
          onToggle={() => void setPaused.trigger(!config.paused).catch(() => {})}
          enabledTone="warn"
        />
        <Row
          label="Emergency mode"
          description="Frozen mode that unlocks emergency refunds and emergency LP exits only."
          enabled={config.emergencyMode}
          isPending={setEmergency.isPending}
          disabled={!isAdmin}
          onToggle={() =>
            void setEmergency.trigger(!config.emergencyMode).catch(() => {})
          }
          enabledTone="bad"
        />
      </div>
    </Panel>
  );
}

function Row(props: {
  label: string;
  description: string;
  enabled: boolean;
  isPending: boolean;
  disabled: boolean;
  enabledTone: "warn" | "bad";
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border-low bg-background/40 p-3">
      <div className="grid gap-1">
        <p className="text-sm font-semibold">{props.label}</p>
        <p className="text-xs text-muted">{props.description}</p>
        <StatusBadge tone={props.enabled ? props.enabledTone : "good"}>
          {props.enabled ? "ON" : "OFF"}
        </StatusBadge>
      </div>
      <ActionButton
        variant={props.enabled ? "secondary" : "danger"}
        size="sm"
        disabled={props.disabled}
        isPending={props.isPending}
        onClick={props.onToggle}
      >
        {props.enabled ? "Disable" : "Enable"}
      </ActionButton>
    </div>
  );
}
