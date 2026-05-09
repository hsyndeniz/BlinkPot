"use client";

import { useState } from "react";
import { address as parseAddress, type Address } from "@solana/kit";
import { RoundState, type TicketPickArgs } from "../../../generated/lottery";
import {
  useBuyerEntry,
  useConfig,
  useCurrentRound,
} from "../../../lib/lottery/accounts";
import { useBuyTickets } from "../../../lib/lottery/actions";
import { useWallet } from "../../../lib/wallet/context";
import { useMint, useTokenSymbol } from "../../../lib/lottery/tokens";
import {
  ActionButton,
  BallStrip,
  DecimalsHeadsUp,
  Field,
  Panel,
  StatusBadge,
  TokenAmount,
} from "../shared";

// Solana caps transactions at 1232 bytes. `buy_tickets` adds 2 account-metas
// per pick (ticket PDA + PickCounter PDA) on top of 16 fixed accounts, and we
// also prepend an idempotent createAta. 7 picks lands at the edge (~1227 B);
// 8+ overflows. Bumping this requires Address Lookup Tables.
const MAX_BATCH = 7;

function quickPick(normalMax: number, bonusMax: number): TicketPickArgs {
  const pool = Array.from({ length: normalMax }, (_, i) => i + 1);
  // Fisher-Yates partial shuffle to draw 5 distinct sorted normals.
  for (let i = pool.length - 1; i > pool.length - 6; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const normals = Uint8Array.from(pool.slice(-5).sort((a, b) => a - b));
  const bonus = 1 + Math.floor(Math.random() * bonusMax);
  return { normals, bonusball: bonus };
}

function parseManualPick(
  normalCsv: string,
  bonusStr: string,
  normalMax: number,
  bonusMax: number
): TicketPickArgs {
  const normals = normalCsv
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isFinite(n));
  if (normals.length !== 5)
    throw new Error("Enter exactly 5 comma-separated normal balls.");
  const sorted = [...normals].sort((a, b) => a - b);
  if (sorted.some((n) => n <= 0 || n > normalMax))
    throw new Error(`Each normal ball must be 1..${normalMax}.`);
  if (sorted.some((n, i) => i > 0 && n === sorted[i - 1]))
    throw new Error("Normal balls must be unique.");
  if (sorted.some((n, i) => n !== normals[i]))
    throw new Error("Normal balls must be sorted ascending.");
  const bonus = Number(bonusStr.trim());
  if (!Number.isFinite(bonus) || bonus < 1 || bonus > bonusMax)
    throw new Error(`Bonus ball must be 1..${bonusMax}.`);
  return { normals: Uint8Array.from(sorted), bonusball: bonus };
}

function tryParseAddress(value: string): Address | undefined {
  try {
    return value.trim() ? parseAddress(value.trim()) : undefined;
  } catch {
    return undefined;
  }
}

export function BuyTicketsPanel() {
  const { signer, wallet } = useWallet();
  const walletAddress = signer?.address ?? wallet?.account.address;
  const { config } = useConfig();
  const { round, address: roundAddress } = useCurrentRound();
  const buy = useBuyTickets();
  const { decimals } = useMint(config?.paymentMint);
  const symbol = useTokenSymbol(config?.paymentMint);

  const buyerEntry = useBuyerEntry(round?.roundId, walletAddress);

  const [normalInput, setNormalInput] = useState("1,2,3,4,5");
  const [bonusInput, setBonusInput] = useState("1");
  const [batchInput, setBatchInput] = useState("1");
  const [referrerInput, setReferrerInput] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const normalMax = round?.normalBallMax ?? config?.normalBallMax ?? 30;
  const bonusMax = round?.bonusballMax ?? config?.bonusballMax ?? 15;
  const ticketPrice = round?.ticketPrice ?? 0n;
  const batchCount = Math.max(1, Math.min(MAX_BATCH, Number(batchInput || "1")));
  const totalCost = ticketPrice * BigInt(batchCount);

  const blocked =
    !signer ||
    !config ||
    !round ||
    !roundAddress ||
    config.paused ||
    config.emergencyMode ||
    round.state !== RoundState.Open;

  const handleQuickPick = () => {
    const pick = quickPick(normalMax, bonusMax);
    setNormalInput(pick.normals.join(","));
    setBonusInput(pick.bonusball.toString());
  };

  const handleSubmit = async () => {
    setLocalError(null);
    if (!round || !roundAddress) return;
    try {
      const firstPick = parseManualPick(
        normalInput,
        bonusInput,
        normalMax,
        bonusMax
      );
      const picks: TicketPickArgs[] = [firstPick];
      while (picks.length < batchCount) {
        picks.push(quickPick(normalMax, bonusMax));
      }
      const referrer = tryParseAddress(referrerInput);
      if (referrer && walletAddress && referrer === walletAddress) {
        throw new Error("Referrer cannot be your own wallet.");
      }
      const firstTicketIndex = buyerEntry.buyerEntry?.ticketCount ?? 0n;
      await buy
        .trigger({
          round: { address: roundAddress, data: round },
          picks,
          firstTicketIndex,
          referrer,
        })
        .catch(() => {});
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Panel
      title="Buy tickets"
      description={
        blocked ? (
          <StatusBadge tone="warn">
            {!signer
              ? "Connect a wallet"
              : !config
                ? "Config not initialized"
                : !round
                  ? "No active round"
                  : config.paused
                    ? "Protocol paused"
                    : config.emergencyMode
                      ? "Emergency mode"
                      : "Round is not open"}
          </StatusBadge>
        ) : (
          <span className="flex items-center gap-2 text-xs text-muted">
            Range 1..{normalMax} · bonus 1..{bonusMax} · price{" "}
            <TokenAmount
              amount={ticketPrice}
              decimals={decimals}
              mint={config?.paymentMint}
            />
          </span>
        )
      }
    >
      <div className="grid gap-3">
        <DecimalsHeadsUp
          decimals={decimals}
          detected={!!config}
          symbol={symbol}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Normal balls (5, comma-separated, ascending)"
            value={normalInput}
            onChange={setNormalInput}
            placeholder="1,2,3,4,5"
          />
          <Field
            label="Bonus ball"
            value={bonusInput}
            onChange={setBonusInput}
            placeholder="1"
          />
          <Field
            label="Batch count (1..7)"
            value={batchInput}
            onChange={setBatchInput}
            placeholder="1"
            hint="First ticket uses the manual pick above; remainder are quick-picks."
          />
          <Field
            label="Referrer (optional)"
            value={referrerInput}
            onChange={setReferrerInput}
            placeholder="Referrer wallet pubkey"
          />
        </div>

        <div className="flex items-center gap-2">
          <ActionButton size="sm" variant="ghost" onClick={handleQuickPick}>
            Quick pick
          </ActionButton>
          <p className="text-xs text-muted">
            <span>Total: </span>
            <TokenAmount
              amount={totalCost}
              decimals={decimals}
              mint={config?.paymentMint}
            />
          </p>
          <div className="ml-auto">
            <ActionButton
              variant="primary"
              size="sm"
              disabled={blocked}
              isPending={buy.isPending}
              onClick={() => void handleSubmit()}
            >
              Buy {batchCount} ticket{batchCount === 1 ? "" : "s"}
            </ActionButton>
          </div>
        </div>

        {(localError || buy.lastError) && (
          <p className="text-xs text-destructive">
            {localError ?? buy.lastError}
          </p>
        )}

        <PreviewBalls
          normalCsv={normalInput}
          bonus={bonusInput}
          normalMax={normalMax}
          bonusMax={bonusMax}
        />
      </div>
    </Panel>
  );
}

function PreviewBalls(props: {
  normalCsv: string;
  bonus: string;
  normalMax: number;
  bonusMax: number;
}) {
  let pick: TicketPickArgs | null = null;
  try {
    pick = parseManualPick(
      props.normalCsv,
      props.bonus,
      props.normalMax,
      props.bonusMax
    );
  } catch {
    pick = null;
  }
  if (!pick) return null;
  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <span>Preview:</span>
      <BallStrip normals={pick.normals} bonusball={pick.bonusball} />
    </div>
  );
}
