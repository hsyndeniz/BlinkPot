"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Popover, Separator, Surface } from "@heroui/react";
import {
  Circle,
  House,
  Persons,
  ShieldCheck,
  Terminal,
  Ticket,
} from "@gravity-ui/icons";
import { useWallet } from "../lib/wallet/context";
import { useBalance } from "../lib/hooks/use-balance";
import { lamportsToSolString } from "../lib/lamports";
import { ellipsify } from "../lib/explorer";
import { useCluster } from "./cluster-context";

export function WalletButton() {
  const { connectors, connect, disconnect, wallet, status, error } =
    useWallet();
  const { getExplorerUrl } = useCluster();
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const address = wallet?.account.address;
  const balance = useBalance(address);

  const handleCopy = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (status !== "connected") {
    return (
      <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
        <Popover.Trigger>
          <Button variant="primary" size="sm">
            Connect Wallet
          </Button>
        </Popover.Trigger>
        <Popover.Content placement="bottom end" className="w-64">
          <Popover.Dialog className="grid gap-2">
            <Popover.Heading>Choose a wallet</Popover.Heading>
            <div className="grid gap-1">
              {connectors.map((connector) => (
                <Button
                  key={connector.id}
                  variant="ghost"
                  size="sm"
                  fullWidth
                  className="justify-start"
                  isDisabled={status === "connecting"}
                  onPress={async () => {
                    try {
                      await connect(connector.id);
                      setIsOpen(false);
                    } catch {
                      // surfaced via context state
                    }
                  }}
                >
                  {connector.icon && (
                    // eslint-disable-next-line @next/next/no-img-element -- connector icons are external data URLs, not assets we own
                    <img
                      src={connector.icon}
                      alt=""
                      className="size-5 rounded"
                    />
                  )}
                  {connector.name}
                </Button>
              ))}
            </div>
            {status === "connecting" && (
              <p className="text-xs text-muted">Connecting...</p>
            )}
            {error != null && (
              <p className="text-xs text-danger">
                {error instanceof Error ? error.message : String(error)}
              </p>
            )}
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
    );
  }

  return (
    <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger>
        <Button variant="outline" size="sm">
          <Circle className="size-1.5 text-success" />
          <span className="font-mono">{ellipsify(address!, 4)}</span>
        </Button>
      </Popover.Trigger>
      <Popover.Content placement="bottom end" className="w-72">
        <Popover.Dialog className="grid gap-3">
          <div className="grid gap-1">
            <span className="text-xs text-muted">Balance</span>
            <p className="text-lg font-bold tabular-nums">
              {balance.lamports != null
                ? lamportsToSolString(balance.lamports)
                : "—"}{" "}
              <span className="text-sm font-normal text-muted">SOL</span>
            </p>
          </div>

          <Surface variant="secondary" className="rounded-lg p-2">
            <p className="break-all font-mono text-xs">{address}</p>
          </Surface>

          <div className="grid">
            <Link
              href="/"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-default-100"
            >
              <House className="size-4 text-muted" />
              Play
            </Link>
            <Link
              href="/tickets"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-default-100"
            >
              <Ticket className="size-4 text-muted" />
              My tickets
            </Link>
            <Link
              href="/referrals"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-default-100"
            >
              <Persons className="size-4 text-muted" />
              Referrals
            </Link>
            <Link
              href="/liquidity"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-default-100"
            >
              <ShieldCheck className="size-4 text-muted" />
              Liquidity
            </Link>
            <Link
              href="/console"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-default-100"
            >
              <Terminal className="size-4 text-muted" />
              Console
            </Link>
          </div>

          <Separator />

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              fullWidth
              onPress={() => void handleCopy()}
            >
              {copied ? "Copied!" : "Copy address"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              fullWidth
              onPress={() => {
                window.open(
                  getExplorerUrl(`/address/${address}`),
                  "_blank",
                  "noopener,noreferrer"
                );
              }}
            >
              Explorer
            </Button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            fullWidth
            onPress={() => {
              disconnect();
              setIsOpen(false);
            }}
          >
            Disconnect
          </Button>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
