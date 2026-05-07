"use client";

import { useState } from "react";
import { address as parseAddress, type Address } from "@solana/kit";
import { useConfig } from "../../../lib/lottery/accounts";
import { useSubscribeDaily } from "../../../lib/lottery/actions";
import { useWallet } from "../../../lib/wallet/context";
import { useMint, useTokenSymbol } from "../../../lib/lottery/tokens";
import {
  ActionButton,
  Field,
  Panel,
  TokenAmount,
} from "../shared";

function tryParseAddress(value: string): Address | undefined {
  try {
    return value.trim() ? parseAddress(value.trim()) : undefined;
  } catch {
    return undefined;
  }
}

export function CreateSubscriptionForm() {
  const { signer, wallet } = useWallet();
  const walletAddress = signer?.address ?? wallet?.account.address;
  const { config } = useConfig();
  const { decimals } = useMint(config?.paymentMint);
  const symbol = useTokenSymbol(config?.paymentMint);
  const subscribe = useSubscribeDaily();

  const [count, setCount] = useState("1");
  const [days, setDays] = useState("7");
  const [referrerInput, setReferrerInput] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const dailyCountNum = Number(count);
  const daysNum = Number(days);
  const totalUnits =
    config && Number.isFinite(dailyCountNum) && Number.isFinite(daysNum)
      ? config.defaultTicketPrice *
        BigInt(Math.max(0, dailyCountNum)) *
        BigInt(Math.max(0, daysNum))
      : 0n;

  const handleSubmit = async () => {
    setLocalError(null);
    try {
      const c = Number(count);
      const d = Number(days);
      if (!Number.isFinite(c) || c < 1 || c > 20)
        throw new Error("Daily ticket count must be 1..20.");
      if (!Number.isFinite(d) || d < 1 || d > 365)
        throw new Error("Days must be 1..365.");
      const referrer = tryParseAddress(referrerInput);
      if (referrer && walletAddress && referrer === walletAddress) {
        throw new Error("Referrer cannot be your own wallet.");
      }
      await subscribe
        .trigger({ dailyTicketCount: c, days: d, referrer })
        .catch(() => {});
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Panel
      title="Create subscription"
      description="Pre-fund N tickets per round for D days. Tickets are minted by a keeper at process_subscription time."
    >
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label="Daily tickets (1..20)"
            value={count}
            onChange={setCount}
          />
          <Field label="Days (1..365)" value={days} onChange={setDays} />
          <Field
            label="Referrer (optional)"
            value={referrerInput}
            onChange={setReferrerInput}
          />
        </div>
        <p className="text-xs text-muted">
          Up-front escrow:{" "}
          <TokenAmount
            amount={totalUnits}
            decimals={decimals}
            mint={config?.paymentMint}
          />{" "}
          ({symbol})
        </p>
        {(localError ?? subscribe.lastError) && (
          <p className="text-xs text-destructive">
            {localError ?? subscribe.lastError}
          </p>
        )}
        <div className="flex justify-end">
          <ActionButton
            variant="primary"
            size="sm"
            isPending={subscribe.isPending}
            onClick={() => void handleSubmit()}
          >
            Subscribe
          </ActionButton>
        </div>
      </div>
    </Panel>
  );
}
