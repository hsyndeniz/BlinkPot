"use client";

import { useState } from "react";
import { useCluster } from "../../cluster-context";
import { useActivitySignatures } from "../../../lib/lottery/activity";
import {
  ActionButton,
  EmptyState,
  Panel,
  RelativeTime,
  Skeleton,
  StatusBadge,
} from "../shared";

export function ActivityFeedPanel() {
  const { getExplorerUrl } = useCluster();
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([
    undefined,
  ]);
  const cursor = cursorStack[cursorStack.length - 1];
  const feed = useActivitySignatures(cursor);

  return (
    <Panel
      title="Activity feed"
      description={
        <span className="text-xs text-muted">
          Lottery program signatures (newest first). Click a row to view the
          transaction in the explorer.
        </span>
      }
    >
      {feed.isLoading ? (
        <Skeleton rows={5} />
      ) : feed.items.length === 0 ? (
        <EmptyState description="No signatures returned for this program." />
      ) : (
        <div className="grid gap-2 text-xs">
          {feed.items.map((item) => (
            <a
              key={item.signature}
              href={getExplorerUrl(`/tx/${item.signature}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="grid gap-1 rounded-md border border-border-low bg-background/40 px-3 py-2 transition hover:bg-cream"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono">
                  {item.signature.slice(0, 12)}…{item.signature.slice(-12)}
                </span>
                {item.err ? (
                  <StatusBadge tone="bad" className="!text-[10px]">
                    failed
                  </StatusBadge>
                ) : (
                  <StatusBadge tone="good" className="!text-[10px]">
                    confirmed
                  </StatusBadge>
                )}
              </div>
              <div className="flex items-center justify-between gap-3 text-muted">
                <span>slot {item.slot.toString()}</span>
                <RelativeTime
                  unixSeconds={item.blockTime ?? undefined}
                  fallback="—"
                  showAbsolute={false}
                />
              </div>
              {item.memo && (
                <p className="text-[11px] text-muted">memo: {item.memo}</p>
              )}
            </a>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <ActionButton
          variant="secondary"
          size="sm"
          disabled={cursorStack.length <= 1}
          onClick={() => setCursorStack((s) => s.slice(0, -1))}
        >
          ← Newer
        </ActionButton>
        <ActionButton
          variant="secondary"
          size="sm"
          disabled={!feed.nextCursor}
          onClick={() => {
            if (feed.nextCursor)
              setCursorStack((s) => [...s, feed.nextCursor as string]);
          }}
        >
          Older →
        </ActionButton>
      </div>
    </Panel>
  );
}
