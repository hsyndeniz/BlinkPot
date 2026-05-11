"use client";

import { useState } from "react";
import { useConfig } from "../../../lib/lottery/accounts";
import { useIsAdmin } from "../../../lib/lottery/admin";
import { useInitTrophyCollection } from "../../../lib/lottery/actions";
import {
  ActionButton,
  EmptyState,
  Field,
  Panel,
  StatusBadge,
} from "../shared";
import { AddressLink } from "../shared/address-link";

const PUBKEY_DEFAULT = "11111111111111111111111111111111";

export function InitTrophyCollectionPanel() {
  const { config } = useConfig();
  const isAdmin = useIsAdmin();
  const action = useInitTrophyCollection();

  const [name, setName] = useState("BlinkPot Winners");
  const [uri, setUri] = useState(
    typeof window !== "undefined"
      ? `${window.location.origin}/api/trophy-collection-metadata`
      : "https://blinkpot.io/api/trophy-collection-metadata"
  );

  if (!config) {
    return (
      <Panel title="Trophy collection">
        <EmptyState description="Initialize config first." />
      </Panel>
    );
  }

  const initialized =
    !!config.trophyCollection && config.trophyCollection !== PUBKEY_DEFAULT;

  const handleSubmit = () =>
    void action.trigger({ name, uri }).catch(() => {});

  return (
    <Panel
      title="Trophy collection"
      description={
        initialized ? (
          <StatusBadge tone="good">Initialized</StatusBadge>
        ) : !isAdmin ? (
          <StatusBadge tone="bad">Admin only</StatusBadge>
        ) : (
          <StatusBadge tone="warn">Not initialized</StatusBadge>
        )
      }
      action={
        !initialized ? (
          <ActionButton
            variant="primary"
            size="sm"
            disabled={!isAdmin || !name.trim() || !uri.trim()}
            isPending={action.isPending}
            onClick={handleSubmit}
          >
            Initialize
          </ActionButton>
        ) : undefined
      }
    >
      <div className="grid gap-3">
        <p className="text-xs text-muted">
          Creates an MPL Core collection with a{" "}
          <span className="font-mono text-foreground">
            PermanentFreezeDelegate {`{ frozen: true, authority: None }`}
          </span>{" "}
          plugin and pins it on{" "}
          <span className="font-mono text-foreground">
            config.trophy_collection
          </span>
          . Every winning <span className="font-mono">claim_winnings</span>{" "}
          mints a permanently soulbound asset into this collection. One-time;
          irreversible.
        </p>

        {initialized ? (
          <div className="rounded-md border border-border-low bg-background/40 p-3 text-xs">
            <div className="grid gap-1">
              <span className="text-muted">Collection</span>
              <AddressLink
                address={config.trophyCollection}
                truncate={6}
                showCopy
              />
            </div>
          </div>
        ) : (
          <>
            <Field
              label="Collection name"
              value={name}
              onChange={setName}
              placeholder="BlinkPot Winners"
            />
            <Field
              label="Collection metadata URI"
              value={uri}
              onChange={setUri}
              placeholder="https://your-host/api/trophy-collection-metadata"
              hint="JSON describing the collection (image, name, description). Stored on the collection asset; per-trophy URIs are computed separately."
            />
            {action.lastError && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                {action.lastError}
              </p>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
