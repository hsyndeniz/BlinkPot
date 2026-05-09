import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Liquidity · BlinkPot Lottery",
  description:
    "Deposit liquidity to underwrite jackpots and earn a share of the house edge from every round.",
};

export default function LpLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
