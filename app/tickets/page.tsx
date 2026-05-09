"use client";

import Link from "next/link";
import { Card } from "@heroui/react";
import { AppHeader } from "../components/app-header";
import { useWallet } from "../lib/wallet/context";
import { LotteryBackdrop } from "../play/components/lottery-backdrop";
import { CurrentRoundTicketsCard } from "./components/current-round-tickets-card";
import { LifetimeEarningsCard } from "./components/lifetime-earnings-card";
import { PastRoundsList } from "./components/past-rounds-list";
import { SubscriptionStatusCard } from "./components/subscription-status-card";
import { LifetimeEarningsProvider } from "./_lifetime-context";

export default function TicketsPage() {
  const { signer, wallet } = useWallet();
  const walletAddress = signer?.address ?? wallet?.account.address;

  return (
    <>
      <LotteryBackdrop />
      <AppHeader eyebrow="My tickets" />

      <main className="mx-auto w-full max-w-5xl px-4 py-2">
        {!walletAddress ? (
          <div className="mx-auto max-w-lg">
            <Card>
              <Card.Content className="grid gap-2 py-6 text-center">
                <span className="text-sm font-semibold">
                  Connect a wallet to see your tickets
                </span>
                <p className="text-xs text-muted">
                  Your subscription, current-round tickets, and past-round
                  winnings live here.
                </p>
                <Link href="/" className="text-xs underline text-muted">
                  Or head to play
                </Link>
              </Card.Content>
            </Card>
          </div>
        ) : (
          <LifetimeEarningsProvider>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start">
              <div className="grid gap-3">
                <SubscriptionStatusCard />
                <CurrentRoundTicketsCard />
              </div>
              <div className="grid gap-3">
                <LifetimeEarningsCard />
                <PastRoundsList />
              </div>
            </div>
          </LifetimeEarningsProvider>
        )}
      </main>
    </>
  );
}
