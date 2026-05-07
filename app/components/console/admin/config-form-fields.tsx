"use client";

import type { ConfigForm } from "../../../lib/lottery/forms/config-form";
import { Field, SelectField, ToggleField } from "../shared";

export function ConfigFormFields(props: {
  form: ConfigForm;
  symbol: string;
  onChange: <K extends keyof ConfigForm>(key: K, value: ConfigForm[K]) => void;
  disabled?: boolean;
}) {
  const { form, symbol, onChange, disabled } = props;

  return (
    <div className="grid gap-4">
      <section className="grid gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Pricing & timing
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label={`Default ticket price (${symbol})`}
            value={form.defaultTicketPrice}
            onChange={(v) => onChange("defaultTicketPrice", v)}
            disabled={disabled}
            hint="Whole-token amount; converted to base units automatically."
          />
          <Field
            label="Default round duration (seconds)"
            value={form.defaultRoundDurationSecs}
            onChange={(v) => onChange("defaultRoundDurationSecs", v)}
            disabled={disabled}
            hint="Min 60s, max 7d."
          />
          <Field
            label={`Guaranteed prize pool (${symbol})`}
            value={form.guaranteedPrizePool}
            onChange={(v) => onChange("guaranteedPrizePool", v)}
            disabled={disabled}
            hint="0 disables the guarantee."
          />
          <Field
            label="Max guarantee BPS of LP NAV"
            value={form.maxGuaranteePerRoundBps}
            onChange={(v) => onChange("maxGuaranteePerRoundBps", v)}
            disabled={disabled}
            hint="0 = guarantees disabled. Max 5000 (50%)."
          />
          <Field
            label="Draw timeout slots"
            value={form.drawTimeoutSlots}
            onChange={(v) => onChange("drawTimeoutSlots", v)}
            disabled={disabled}
          />
        </div>
      </section>

      <section className="grid gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Ball configuration
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label="Normal ball max"
            value={form.normalBallMax}
            onChange={(v) => onChange("normalBallMax", v)}
            disabled={disabled}
          />
          <Field
            label="Bonusball max (static)"
            value={form.bonusballMax}
            onChange={(v) => onChange("bonusballMax", v)}
            disabled={disabled}
            hint="5..64. Ignored when dynamic mode is on."
          />
          <Field
            label="Bonusball base (dynamic)"
            value={form.bonusballBase}
            onChange={(v) => onChange("bonusballBase", v)}
            disabled={disabled}
          />
          <Field
            label={`Bonusball pool step (${symbol})`}
            value={form.bonusballPoolStepUnits}
            onChange={(v) => onChange("bonusballPoolStepUnits", v)}
            disabled={disabled}
            hint="+1 to bonus max for every step of pool size."
          />
          <ToggleField
            label="Dynamic bonusball"
            checked={form.dynamicBonusballEnabled}
            onChange={(v) => onChange("dynamicBonusballEnabled", v)}
            disabled={disabled}
            hint="Bonus max scales with prize pool when enabled."
          />
        </div>
      </section>

      <section className="grid gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Fees & sharing
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label="LP edge (bps)"
            value={form.lpEdgeBps}
            onChange={(v) => onChange("lpEdgeBps", v)}
            disabled={disabled}
          />
          <Field
            label="Referral fee 1st (bps)"
            value={form.referralFeeFirstBps}
            onChange={(v) => onChange("referralFeeFirstBps", v)}
            disabled={disabled}
          />
          <Field
            label="Referral fee 2nd (bps)"
            value={form.referralFeeSecondBps}
            onChange={(v) => onChange("referralFeeSecondBps", v)}
            disabled={disabled}
          />
          <Field
            label="Referral win share 1st (bps)"
            value={form.referralWinShareFirstBps}
            onChange={(v) => onChange("referralWinShareFirstBps", v)}
            disabled={disabled}
          />
          <Field
            label="Referral win share 2nd (bps)"
            value={form.referralWinShareSecondBps}
            onChange={(v) => onChange("referralWinShareSecondBps", v)}
            disabled={disabled}
          />
          <Field
            label={`LP pool cap (${symbol})`}
            value={form.lpPoolCap}
            onChange={(v) => onChange("lpPoolCap", v)}
            disabled={disabled}
            hint="0 = uncapped."
          />
        </div>
      </section>

      <section className="grid gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Tiers
        </h3>
        <div className="grid gap-3">
          <Field
            label="Tier premium weight bps (12 values, sum to 10000)"
            value={form.tierPremiumWeightBps}
            onChange={(v) => onChange("tierPremiumWeightBps", v)}
            disabled={disabled}
            hint="Comma-separated. Non-winning tiers must be 0."
          />
          <Field
            label={`Tier minimum payouts (${symbol}, 12 values)`}
            value={form.tierMinPayoutPerWinner}
            onChange={(v) => onChange("tierMinPayoutPerWinner", v)}
            disabled={disabled}
            hint="Comma-separated, whole-token amounts."
          />
          <Field
            label="Tier is-winning flags (12 values, 0 or 1)"
            value={form.tierIsWinning}
            onChange={(v) => onChange("tierIsWinning", v)}
            disabled={disabled}
            hint="Comma-separated booleans."
          />
          <Field
            label="Premium minimum allocation bps"
            value={form.premiumMinAllocationBps}
            onChange={(v) => onChange("premiumMinAllocationBps", v)}
            disabled={disabled}
            hint="Floor for premium pool after guaranteed minimums."
          />
          <SelectField
            label="Untaken tier destination"
            value={form.untakenTierDestination}
            onChange={(v) =>
              onChange(
                "untakenTierDestination",
                (v === "lpPool" ? "lpPool" : "nextRound") as "lpPool" | "nextRound"
              )
            }
            disabled={disabled}
            hint="Where leftover prize budget goes at archive_round."
          >
            <option value="nextRound">Next round seed</option>
            <option value="lpPool">LP pool</option>
          </SelectField>
        </div>
      </section>
    </div>
  );
}
