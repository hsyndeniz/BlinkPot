"use client";

import { useConfig } from "../../../lib/lottery/accounts";
import { useIsAdmin } from "../../../lib/lottery/admin";
import { useSetPaused } from "../../../lib/lottery/actions";
import { ActionButton } from "../shared";

export function PauseBanner() {
  const { config } = useConfig();
  const isAdmin = useIsAdmin();
  const setPaused = useSetPaused();

  if (!config?.paused) return null;
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
      <div className="flex items-center justify-between gap-3">
        <span>
          <strong className="font-semibold">Protocol paused.</strong> Most
          actions are blocked until an admin resumes operations.
        </span>
        {isAdmin && (
          <ActionButton
            variant="secondary"
            size="sm"
            isPending={setPaused.isPending}
            onClick={() => void setPaused.trigger(false).catch(() => {})}
          >
            Resume
          </ActionButton>
        )}
      </div>
    </div>
  );
}
