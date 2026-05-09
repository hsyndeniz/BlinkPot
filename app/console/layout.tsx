import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Console · BlinkPot Lottery",
  description:
    "Operations console for monitoring rounds, managing config, and running admin actions.",
};

export default function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
