"use client";

import Link from "next/link";
import { Card } from "@heroui/react";
import { AppHeader } from "../components/app-header";
import { useConfig } from "../lib/lottery/accounts";
import { useWallet } from "../lib/wallet/context";
import { LotteryBackdrop } from "../play/components/lottery-backdrop";
import { CurrentRoundTicketsCard } from "./components/current-round-tickets-card";
import { LifetimeEarningsCard } from "./components/lifetime-earnings-card";
import { PastRoundsList } from "./components/past-rounds-list";
import { SubscriptionStatusCard } from "./components/subscription-status-card";
import { TrophiesGallery } from "./components/trophies-gallery";
import { LifetimeEarningsProvider } from "./_lifetime-context";

const PUBKEY_DEFAULT = "11111111111111111111111111111111";

export default function TicketsPage() {
  const { signer, wallet } = useWallet();
  const walletAddress = signer?.address ?? wallet?.account.address;
  const { config } = useConfig();
  const trophyCollection = config?.trophyCollection;
  console.log("trophyCollection", trophyCollection);
  const trophiesReady =
    !!trophyCollection && trophyCollection !== PUBKEY_DEFAULT;

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
            <div className="grid gap-6">
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

              {trophiesReady && (
                <section id="trophies" className="grid gap-3">
                  <header className="grid gap-1">
                    <h2 className="text-sm font-semibold tracking-tight">
                      Soulbound trophies
                    </h2>
                    <p className="text-xs text-muted">
                      Every winning claim mints a permanent MPL Core NFT bound
                      to its winner&rsquo;s wallet via the collection&rsquo;s{" "}
                      <span className="font-mono text-foreground">
                        PermanentFreezeDelegate
                      </span>{" "}
                      plugin.
                    </p>
                  </header>
                  <TrophiesGallery collection={trophyCollection} />
                </section>
              )}
            </div>
          </LifetimeEarningsProvider>
        )}
      </main>
    </>
  );
}
