"use client";

import { Card, Surface } from "@heroui/react";
import { Gift, Sparkles } from "@gravity-ui/icons";
import { useConfig } from "../../lib/lottery/accounts";

export function ReferralHeroCard() {
  const { config } = useConfig();

  const firstPct =
    config != null ? (config.referralFeeFirstBps / 100).toFixed(1) : "—";
  const secondPct =
    config != null ? (config.referralFeeSecondBps / 100).toFixed(1) : "—";

  return (
    <Card className="w-full">
      <Card.Content className="grid gap-4">
        <div className="flex items-start gap-3">
          <Surface
            variant="secondary"
            className="flex size-10 shrink-0 items-center justify-center rounded-2xl text-warning"
          >
            <Gift className="size-5" />
          </Surface>
          <div className="grid gap-1">
            <h2 className="text-lg font-bold tracking-tight sm:text-xl">
              Invite friends, earn on every ticket
            </h2>
            <p className="text-sm text-muted">
              Share your link and pocket a slice of every ticket your friends
              buy — plus a smaller cut of tickets the friends they invite buy.
            </p>
          </div>
        </div>

        <Surface
          variant="secondary"
          className="grid grid-cols-2 gap-3 rounded-2xl p-3"
        >
          <div className="grid gap-1">
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              <Sparkles className="size-3" />
              Direct
            </span>
            <span className="text-xl font-bold tabular-nums">
              {firstPct}
              <span className="ml-0.5 text-sm font-semibold text-muted">%</span>
            </span>
            <span className="text-xs text-muted">
              of every ticket your invitees buy
            </span>
          </div>
          <div className="grid gap-1">
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              <Sparkles className="size-3" />
              Indirect
            </span>
            <span className="text-xl font-bold tabular-nums">
              {secondPct}
              <span className="ml-0.5 text-sm font-semibold text-muted">%</span>
            </span>
            <span className="text-xs text-muted">
              of tickets their invitees buy
            </span>
          </div>
        </Surface>
      </Card.Content>
    </Card>
  );
}
