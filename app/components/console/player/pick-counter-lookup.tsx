"use client";

import { useState } from "react";
import { useConfig, useCurrentRound } from "../../../lib/lottery/accounts";
import { usePickCounter } from "../../../lib/lottery/pick-counter";
import { useMint } from "../../../lib/lottery/tokens";
import {
  ActionButton,
  AddressLink,
  BallStrip,
  Field,
  Panel,
  StatusBadge,
  TokenAmount,
} from "../shared";
import { evaluatePick } from "../../../lib/lottery/picks";

export function PickCounterLookup() {
  const { config } = useConfig();
  const { round } = useCurrentRound();
  const { decimals } = useMint(config?.paymentMint);

  const [normalInput, setNormalInput] = useState("1,2,3,4,5");
  const [bonusInput, setBonusInput] = useState("1");
  const [submitted, setSubmitted] = useState<{
    normals: number[];
    bonusball: number;
  } | null>(null);

  const result = usePickCounter(
    submitted && round
      ? {
          roundId: round.roundId,
          normals: submitted.normals,
          bonusball: submitted.bonusball,
        }
      : undefined
  );

  const handleLookup = () => {
    const parsedNormals = normalInput
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
    const bonus = Number(bonusInput.trim());
    if (parsedNormals.length !== 5 || !Number.isFinite(bonus)) return;
    setSubmitted({
      normals: parsedNormals.sort((a, b) => a - b),
      bonusball: bonus,
    });
  };

  // Estimate exact payout if this combo is winning for the current round.
  const estimate = (() => {
    if (!submitted || !round || !result.exists) return null;
    const r = evaluatePick(round, submitted.normals, submitted.bonusball);
    if (!r.winning) return null;
    const perCombo = round.perComboPayout?.[r.tier] ?? 0n;
    const count = result.pickCounter?.count ?? 0;
    return count > 0 ? perCombo / BigInt(count) : null;
  })();

  return (
    <Panel
      title="Pick counter lookup"
      description={
        round
          ? `Round #${round.roundId.toString()} — see how many tickets share an exact combo.`
          : "No active round."
      }
    >
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
          <Field
            label="Normal balls (5, ascending)"
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
          <div className="flex items-end">
            <ActionButton
              variant="primary"
              size="sm"
              disabled={!round}
              onClick={handleLookup}
            >
              Look up
            </ActionButton>
          </div>
        </div>

        {submitted && (
          <div className="grid gap-2 rounded-md border border-border-low bg-background/40 p-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted">Pick:</span>
              <BallStrip
                normals={submitted.normals}
                bonusball={submitted.bonusball}
                winningNormals={round?.winningNormals}
                winningBonusball={round?.winningBonusball}
              />
            </div>
            {result.isLoading ? (
              <span className="text-muted">Loading…</span>
            ) : !result.exists ? (
              <StatusBadge tone="neutral">
                No tickets with this combo (0 holders).
              </StatusBadge>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted">Holders</span>
                  <span className="font-mono">
                    {result.pickCounter?.count ?? 0}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted">PDA</span>
                  <AddressLink address={result.address} showCopy />
                </div>
                {estimate != null && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted">Per-holder payout</span>
                    <TokenAmount
                      amount={estimate}
                      decimals={decimals}
                      mint={config?.paymentMint}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
