"use client";

import { AppHeader } from "./components/app-header";
import { useConfig, useCurrentRound } from "./lib/lottery/accounts";
import { BuyTicketsCard } from "./play/components/buy-tickets-card";
import { CheckoutModal } from "./play/components/checkout-modal";
import { LotteryBackdrop } from "./play/components/lottery-backdrop";
import { LotteryHero } from "./play/components/lottery-hero";
import { NumberEditorModal } from "./play/components/number-editor-modal";
import { PlayFormProvider } from "./play/play-form-context";

export default function Home() {
  const { config } = useConfig();
  const { round } = useCurrentRound();

  // Round-locked ranges win, then config defaults, then sane fallbacks.
  const normalMax = round?.normalBallMax ?? config?.normalBallMax ?? 30;
  const bonusMax = round?.bonusballMax ?? config?.bonusballMax ?? 15;

  return (
    <>
      <LotteryBackdrop />
      <AppHeader eyebrow="Play" />

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
