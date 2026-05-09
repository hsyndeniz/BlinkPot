import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Referrals · BlinkPot Lottery",
  description:
    "Invite friends to play and earn a share of every ticket they buy.",
};

export default function ReferralsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
