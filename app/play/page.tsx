"use client";

import { ClusterSelect } from "../components/cluster-select";
import { WalletButton } from "../components/wallet-button";
import { ThemeToggle } from "../components/theme-toggle";
import { useConfig, useCurrentRound } from "../lib/lottery/accounts";
import { PlayFormProvider } from "./play-form-context";
import { BuyTicketsCard } from "./components/buy-tickets-card";
import { CheckoutModal } from "./components/checkout-modal";
import { LotteryBackdrop } from "./components/lottery-backdrop";
import { LotteryHero } from "./components/lottery-hero";
import { NumberEditorModal } from "./components/number-editor-modal";

export default function PlayPage() {
  const { config } = useConfig();
  const { round } = useCurrentRound();

  // Round-locked ranges win, then config defaults, then sane fallbacks.
  const normalMax = round?.normalBallMax ?? config?.normalBallMax ?? 30;
  const bonusMax = round?.bonusballMax ?? config?.bonusballMax ?? 15;

  return (
    <>
      <LotteryBackdrop />
      <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
        <div>
          <p className="text-sm font-semibold tracking-tight">
            BlinkPot Lottery
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <ClusterSelect />
          <WalletButton />
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col items-center gap-2 px-4 py-0">
        <PlayFormProvider normalMax={normalMax} bonusMax={bonusMax}>
          <LotteryHero />
          <BuyTicketsCard />
          <NumberEditorModal />
          <CheckoutModal />
        </PlayFormProvider>
      </main>
    </>
  );
}
