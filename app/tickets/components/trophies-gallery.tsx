"use client";

import { useMemo, useState } from "react";
import { Card } from "@heroui/react";
import type { Address } from "@solana/kit";
import { useWallet } from "../../lib/wallet/context";
import { useAllTrophies } from "../_use-trophies";
import { TrophyCard } from "./trophy-card";

type Tab = "all" | "mine";

function TabPill(props: {
  active: boolean;
  disabled?: boolean;
  count: number;
  label: string;
  onPress: () => void;
}) {
  const { active, disabled, count, label, onPress } = props;
  const cls = active
    ? "bg-foreground text-background"
    : disabled
      ? "bg-default-50 text-muted/60 cursor-not-allowed"
      : "bg-default-100 text-muted hover:text-foreground";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPress}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${cls}`}
    >
      <span>{label}</span>
      <span className="rounded-full bg-background/20 px-1.5 py-0.5 text-[10px]">
        {count}
      </span>
    </button>
  );
}

export function TrophiesGallery(props: { collection: Address }) {
  const { collection } = props;
  const { signer, wallet } = useWallet();
  const walletAddress = signer?.address ?? wallet?.account.address;
  const { trophies, isLoading, error } = useAllTrophies(collection);

  const [tab, setTab] = useState<Tab>("all");

  const myCount = walletAddress
    ? trophies.filter((t) => t.owner === walletAddress).length
    : 0;

  const visible = useMemo(() => {
    if (tab === "mine" && walletAddress) {
      return trophies.filter((t) => t.owner === walletAddress);
    }
    return trophies;
  }, [trophies, tab, walletAddress]);

  if (error) {
    return (
      <Card>
        <Card.Content className="grid gap-1 py-6 text-center">
          <span className="text-sm font-semibold">
            Could not load trophies
          </span>
          <p className="text-xs text-muted">
            The DAS API returned an error. Try a different cluster or refresh.
          </p>
        </Card.Content>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <TabPill
          active={tab === "all"}
          count={trophies.length}
          label="All winners"
          onPress={() => setTab("all")}
        />
        <TabPill
          active={tab === "mine"}
          disabled={!walletAddress}
          count={myCount}
          label="My wins"
          onPress={() => setTab("mine")}
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[5/6] animate-pulse rounded-lg bg-default-100"
            />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <Card.Content className="grid gap-1 py-12 text-center">
            <span className="text-sm font-semibold">
              {tab === "mine"
                ? "You haven't won any trophies yet"
                : "No trophies minted yet"}
            </span>
            <p className="text-xs text-muted">
              {tab === "mine"
                ? "Buy tickets and claim a winning round to mint a soulbound trophy."
                : "When the first round closes and a winner claims, their trophy will appear here."}
            </p>
          </Card.Content>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {visible.map((t) => (
            <TrophyCard
              key={t.id}
              trophy={t}
              isOwner={!!walletAddress && t.owner === walletAddress}
            />
          ))}
        </div>
      )}
    </div>
  );
}
