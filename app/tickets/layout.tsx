import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Tickets · BlinkPot Lottery",
  description:
    "Manage your active subscription, see tickets for the current round, and claim winnings from past rounds.",
};

export default function TicketsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
