"use client";

import { useState } from "react";
import { useConfig, useCurrentRound, useLpVault } from "../../../lib/lottery/accounts";
import { useStartRound } from "../../../lib/lottery/actions";
import { useMint, parseTokenAmount, useTokenSymbol } from "../../../lib/lottery/tokens";
import {
  ActionButton,
  Field,
  Panel,
  StatusBadge,
  TokenAmount,
} from "../shared";

export function StartRoundForm() {
  const { config } = useConfig();
  const { decimals } = useMint(config?.paymentMint);
  const symbol = useTokenSymbol(config?.paymentMint);
  const { round } = useCurrentRound();
  const { lpVault } = useLpVault();
  const startRound = useStartRound();

  const [ticketPrice, setTicketPrice] = useState("");
  const [duration, setDuration] = useState("");
  const [bonusMax, setBonusMax] = useState("");
  const [guarantee, setGuarantee] = useState("");

  const handleSubmit = async () => {
    try {
      const ticketPriceParsed = ticketPrice
        ? parseTokenAmount(ticketPrice, decimals)
        : 0n;
      const durationParsed = duration ? BigInt(duration) : 0n;
      const bonusParsed = bonusMax ? Number(bonusMax) : 0;
      const guaranteeParsed = guarantee
        ? parseTokenAmount(guarantee, decimals)
        : 0n;

      // Client-side guard for M6: guarantee > 0 requires a non-zero cap.
      if (guaranteeParsed > 0n && (config?.maxGuaranteePerRoundBps ?? 0) === 0) {
        throw new Error(
          "Per-round guarantee is not allowed: max_guarantee_per_round_bps is 0. Update config first."
        );
      }
      await startRound
        .trigger({
          ticketPrice: ticketPriceParsed,
          durationSeconds: durationParsed,
          bonusballMax: bonusParsed,
          guaranteedPrizePoolOverride: guaranteeParsed,
        })
        .catch(() => {});
    } catch {
      // surfaced via lastError
    }
  };

  const canStart =
    !!config &&
    !config.paused &&
    !config.emergencyMode &&
    (!round || round.state === 3 /* Archived */);

  return (
    <Panel
      title="Start round"
      description={
        canStart ? (
          <span>
            Defaults applied when fields are blank: ticket price, duration, bonus
            max, and guarantee come from config.
          </span>
        ) : (
          <StatusBadge tone="warn">
            {!config
              ? "Config not initialized"
              : config.paused
                ? "Protocol paused"
                : config.emergencyMode
                  ? "Emergency mode active"
                  : "Previous round must be archived first"}
          </StatusBadge>
        )
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={`Ticket price (${symbol})`}
          value={ticketPrice}
          onChange={setTicketPrice}
          placeholder={
            config
              ? `default: ${(Number(config.defaultTicketPrice) / 10 ** decimals).toString()}`
              : ""
          }
          hint="Leave blank to use config default."
        />
        <Field
          label="Duration (seconds)"
          value={duration}
          onChange={setDuration}
          placeholder={config?.defaultRoundDurationSecs.toString()}
          hint="Leave blank to use config default."
        />
        <Field
          label="Bonus max"
          value={bonusMax}
          onChange={setBonusMax}
          placeholder={config?.bonusballMax.toString()}
          hint="Blank uses dynamic if enabled, else config default."
        />
        <Field
          label={`Guaranteed prize pool override (${symbol})`}
          value={guarantee}
          onChange={setGuarantee}
          placeholder={
            config
              ? (Number(config.guaranteedPrizePool) / 10 ** decimals).toString()
              : ""
          }
          hint="Blank uses config default."
        />
      </div>

      {lpVault && (
        <p className="mt-3 text-[11px] text-muted">
          LP NAV cap allows up to{" "}
          <TokenAmount
            amount={
              ((lpVault.totalAssets) *
                BigInt(config?.maxGuaranteePerRoundBps ?? 0)) /
              10000n
            }
            decimals={decimals}
            mint={config?.paymentMint}
          />{" "}
          per round.
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-2">
        {startRound.lastError && (
          <p className="text-xs text-destructive">{startRound.lastError}</p>
        )}
        <ActionButton
          variant="primary"
          size="sm"
          disabled={!canStart}
          isPending={startRound.isPending}
          onClick={() => void handleSubmit()}
          className="ml-auto"
        >
          Start round
        </ActionButton>
      </div>
    </Panel>
  );
}
