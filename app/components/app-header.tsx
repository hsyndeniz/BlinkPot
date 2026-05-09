"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  Persons,
  ShieldCheck,
  Terminal,
  Ticket,
} from "@gravity-ui/icons";
import { ClusterSelect } from "./cluster-select";
import { ThemeToggle } from "./theme-toggle";
import { WalletButton } from "./wallet-button";

const NAV = [
  { href: "/", label: "Play", icon: House },
  { href: "/tickets", label: "Tickets", icon: Ticket },
  { href: "/referrals", label: "Referrals", icon: Persons },
  { href: "/liquidity", label: "Liquidity", icon: ShieldCheck },
  { href: "/console", label: "Console", icon: Terminal },
] as const;

function isActiveRoute(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppHeader(props: { eyebrow: string }) {
  const pathname = usePathname() ?? "/";

  return (
    <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
      <div className="flex items-center gap-4 sm:gap-6">
        <Link href="/" className="grid">
          <span className="text-sm font-semibold tracking-tight">
            BlinkPot Lottery
          </span>
          <span className="text-xs text-muted">{props.eyebrow}</span>
        </Link>

        <nav className="flex items-center gap-0.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActiveRoute(href, pathname);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "inline-flex items-center gap-1.5 rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-semibold text-background"
                    : "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted transition hover:bg-default-100 hover:text-foreground"
                }
              >
                <Icon className="size-3.5" />
                <span className="hidden md:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <ThemeToggle />
        <ClusterSelect />
        <WalletButton />
      </div>
    </header>
  );
}
