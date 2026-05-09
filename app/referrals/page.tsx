"use client";

import Link from "next/link";
import { Card, Spinner } from "@heroui/react";
import { AppHeader } from "../components/app-header";
import { useReferral } from "../lib/lottery/accounts";
import { useWallet } from "../lib/wallet/context";
import { LotteryBackdrop } from "../play/components/lottery-backdrop";
import { InitializeReferralCard } from "./components/initialize-referral-card";
import { ReferralHeroCard } from "./components/referral-hero-card";
import { ReferralLinkCard } from "./components/referral-link-card";
import { ReferralRewardsCard } from "./components/referral-rewards-card";

export default function ReferralsPage() {
  const { signer, wallet } = useWallet();
  const walletAddress = signer?.address ?? wallet?.account.address;
  const { referral, isLoading } = useReferral(walletAddress);

  return (
    <>
      <LotteryBackdrop />
      <AppHeader eyebrow="Referrals" />

      <main className="mx-auto w-full max-w-5xl px-4 py-2">
        {!walletAddress ? (
          <div className="mx-auto max-w-lg">
            <Card>
              <Card.Content className="grid gap-2 py-6 text-center">
                <span className="text-sm font-semibold">
                  Connect a wallet to set up your referral link
                </span>
                <p className="text-xs text-muted">
                  Earn a share of every ticket your friends buy.
                </p>
                <Link href="/" className="text-xs underline text-muted">
                  Or head to play
                </Link>
              </Card.Content>
            </Card>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start">
            <div className="grid gap-3">
              <ReferralHeroCard />
              {isLoading ? (
                <Card>
                  <Card.Content className="flex items-center justify-center py-6">
                    <Spinner size="sm" />
                  </Card.Content>
                </Card>
              ) : referral ? (
                <ReferralLinkCard walletAddress={walletAddress} />
              ) : (
                <InitializeReferralCard />
              )}
            </div>

            {isLoading ? null : referral ? (
              <ReferralRewardsCard
                referral={referral}
                walletAddress={walletAddress}
              />
            ) : (
              <Card>
                <Card.Content className="grid gap-2 py-6 text-center">
                  <span className="text-sm font-semibold">
                    Rewards appear once you&apos;re set up
                  </span>
                  <p className="text-xs text-muted">
                    Initialize your referral account on the left, then your
                    accrued and lifetime earnings will live here.
                  </p>
                </Card.Content>
              </Card>
            )}
          </div>
        )}
      </main>
    </>
  );
}
