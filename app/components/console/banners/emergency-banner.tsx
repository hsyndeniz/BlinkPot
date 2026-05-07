"use client";

import { useConfig } from "../../../lib/lottery/accounts";
import { useConsole } from "../../../lib/console/console-context";
import { useIsAdmin } from "../../../lib/lottery/admin";
import { useSetEmergencyMode } from "../../../lib/lottery/actions";
import { ActionButton } from "../shared";

export function EmergencyBanner() {
  const { config } = useConfig();
  const isAdmin = useIsAdmin();
  const { setActiveTab } = useConsole();
  const setEmergencyMode = useSetEmergencyMode();

  if (!config?.emergencyMode) return null;
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
      <div className="flex items-center justify-between gap-3">
        <span>
          <strong className="font-semibold">Emergency mode active.</strong>{" "}
          Normal operations are frozen — only emergency refunds and emergency
          LP exits are available.
        </span>
        <div className="flex items-center gap-2">
          <ActionButton
            variant="secondary"
            size="sm"
            onClick={() => setActiveTab("emergency")}
          >
            Open emergency tools
          </ActionButton>
          {isAdmin && (
            <ActionButton
              variant="secondary"
              size="sm"
              isPending={setEmergencyMode.isPending}
              onClick={() =>
                void setEmergencyMode.trigger(false).catch(() => {})
              }
            >
              Exit emergency
            </ActionButton>
          )}
        </div>
      </div>
    </div>
  );
}
