"use client";

import { Alert, Button } from "@heroui/react";
import { useConfig } from "../../../lib/lottery/accounts";
import { useIsAdmin } from "../../../lib/lottery/admin";
import { useSetPaused } from "../../../lib/lottery/actions";

export function PauseBanner() {
  const { config } = useConfig();
  const isAdmin = useIsAdmin();
  const setPaused = useSetPaused();

  if (!config?.paused) return null;

  return (
    <Alert status="warning">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>Protocol paused</Alert.Title>
        <Alert.Description>
          Most actions are blocked until an admin resumes operations.
        </Alert.Description>
        {isAdmin && (
          <Button
            className="mt-2 sm:hidden"
            size="sm"
            variant="primary"
            isPending={setPaused.isPending}
            onPress={() => void setPaused.trigger(false).catch(() => {})}
          >
            Resume
          </Button>
        )}
      </Alert.Content>
      {isAdmin && (
        <Button
          className="hidden sm:inline-flex"
          size="sm"
          variant="primary"
          isPending={setPaused.isPending}
          onPress={() => void setPaused.trigger(false).catch(() => {})}
        >
          Resume
        </Button>
      )}
    </Alert>
  );
}
