"use client";

import Link from "next/link";
import { Card } from "@heroui/react";
import { AppHeader } from "../components/app-header";
import { useWallet } from "../lib/wallet/context";
import { LotteryBackdrop } from "../play/components/lottery-backdrop";
import { LpActionsCard } from "./components/lp-actions-card";
import { LpHeroCard } from "./components/lp-hero-card";
import { LpPositionCard } from "./components/lp-position-card";
import { LpVaultStatsCard } from "./components/lp-vault-stats-card";

export default function LpPage() {
  const { signer, wallet } = useWallet();
  const walletAddress = signer?.address ?? wallet?.account.address;

  return (
    <>
      <LotteryBackdrop />
      <AppHeader eyebrow="Liquidity" />

      <main className="mx-auto w-full max-w-5xl px-4 py-2">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start">
          <div className="grid gap-3">
            <LpHeroCard />
            <LpVaultStatsCard />
          </div>

          {!walletAddress ? (
            <Card>
              <Card.Content className="grid gap-2 py-6 text-center">
                <span className="text-sm font-semibold">
                  Connect a wallet to deposit
                </span>
                <p className="text-xs text-muted">
                  Your shares, position value, and deposit/withdraw forms appear
                  here once a wallet is connected.
                </p>
                <Link href="/" className="text-xs underline text-muted">
                  Or head to play
                </Link>
              </Card.Content>
            </Card>
          ) : (
            <div className="grid gap-3">
              <LpPositionCard walletAddress={walletAddress} />
              <LpActionsCard walletAddress={walletAddress} />
            </div>
          )}
        </div>
      </main>
    </>
  );
}
