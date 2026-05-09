"use client";

import { Alert, Button } from "@heroui/react";
import { useConfig } from "../../../lib/lottery/accounts";
import { useConsole } from "../../../lib/console/console-context";
import { useIsAdmin } from "../../../lib/lottery/admin";
import { useSetEmergencyMode } from "../../../lib/lottery/actions";

export function EmergencyBanner() {
  const { config } = useConfig();
  const isAdmin = useIsAdmin();
  const { setActiveTab } = useConsole();
  const setEmergencyMode = useSetEmergencyMode();

  if (!config?.emergencyMode) return null;

  return (
    <Alert status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>Emergency mode active</Alert.Title>
        <Alert.Description>
          Normal operations are frozen — only emergency refunds and emergency
          LP exits are available.
        </Alert.Description>
        <div className="mt-2 flex flex-wrap gap-2 sm:hidden">
          <Button
            size="sm"
            variant="danger"
            onPress={() => setActiveTab("emergency")}
          >
            Open emergency tools
          </Button>
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              isPending={setEmergencyMode.isPending}
              onPress={() =>
                void setEmergencyMode.trigger(false).catch(() => {})
              }
            >
              Exit emergency
            </Button>
          )}
        </div>
      </Alert.Content>
      <div className="hidden gap-2 sm:flex">
        <Button
          size="sm"
          variant="danger"
          onPress={() => setActiveTab("emergency")}
        >
          Open emergency tools
        </Button>
        {isAdmin && (
          <Button
            size="sm"
            variant="outline"
            isPending={setEmergencyMode.isPending}
            onPress={() => void setEmergencyMode.trigger(false).catch(() => {})}
          >
            Exit emergency
          </Button>
        )}
      </div>
    </Alert>
  );
}
