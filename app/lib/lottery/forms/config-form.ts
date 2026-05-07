"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type Config,
  type ConfigParamsArgs,
  UntakenTierDestination,
} from "../../../generated/lottery";
import { formatTokenAmount, parseTokenAmount } from "../tokens";
import { TIER_COUNT } from "../picks";

export type ConfigForm = {
  defaultTicketPrice: string;
  defaultRoundDurationSecs: string;
  guaranteedPrizePool: string;
  drawTimeoutSlots: string;
  normalBallMax: string;
  bonusballMax: string;
  lpEdgeBps: string;
  referralFeeFirstBps: string;
  referralFeeSecondBps: string;
  referralWinShareFirstBps: string;
  referralWinShareSecondBps: string;
  tierMinPayoutPerWinner: string;
  tierPremiumWeightBps: string;
  tierIsWinning: string;
  premiumMinAllocationBps: string;
  dynamicBonusballEnabled: boolean;
  bonusballBase: string;
  bonusballPoolStepUnits: string;
  maxGuaranteePerRoundBps: string;
  lpPoolCap: string;
  untakenTierDestination: "nextRound" | "lpPool";
};

export const DEFAULT_CONFIG_FORM: ConfigForm = {
  defaultTicketPrice: "1",
  defaultRoundDurationSecs: "86400",
  guaranteedPrizePool: "1000",
  drawTimeoutSlots: "10",
  normalBallMax: "30",
  bonusballMax: "15",
  lpEdgeBps: "2000",
  referralFeeFirstBps: "800",
  referralFeeSecondBps: "200",
  referralWinShareFirstBps: "800",
  referralWinShareSecondBps: "200",
  tierMinPayoutPerWinner: "0,1,0,2,1,2,5,10,25,50,100,0",
  tierPremiumWeightBps: "0,0,0,1200,0,1200,1200,600,600,600,600,4000",
  tierIsWinning: "0,1,0,1,1,1,1,1,1,1,1,1",
  premiumMinAllocationBps: "2000",
  dynamicBonusballEnabled: true,
  bonusballBase: "5",
  bonusballPoolStepUnits: "10000",
  maxGuaranteePerRoundBps: "3000",
  lpPoolCap: "0",
  untakenTierDestination: "nextRound",
};

export function configToForm(config: Config, decimals: number): ConfigForm {
  return {
    defaultTicketPrice: formatTokenAmount(config.defaultTicketPrice, decimals),
    defaultRoundDurationSecs: config.defaultRoundDurationSecs.toString(),
    guaranteedPrizePool: formatTokenAmount(
      config.guaranteedPrizePool,
      decimals
    ),
    drawTimeoutSlots: config.drawTimeoutSlots.toString(),
    normalBallMax: config.normalBallMax.toString(),
    bonusballMax: config.bonusballMax.toString(),
    lpEdgeBps: config.lpEdgeBps.toString(),
    referralFeeFirstBps: config.referralFeeFirstBps.toString(),
    referralFeeSecondBps: config.referralFeeSecondBps.toString(),
    referralWinShareFirstBps: config.referralWinShareFirstBps.toString(),
    referralWinShareSecondBps: config.referralWinShareSecondBps.toString(),
    tierMinPayoutPerWinner: config.tierMinPayoutPerWinner
      .map((amount) => formatTokenAmount(amount, decimals))
      .join(","),
    tierPremiumWeightBps: config.tierPremiumWeightBps.join(","),
    tierIsWinning: config.tierIsWinning.map((b) => (b ? "1" : "0")).join(","),
    premiumMinAllocationBps: config.premiumMinAllocationBps.toString(),
    dynamicBonusballEnabled: config.dynamicBonusballEnabled,
    bonusballBase: config.bonusballBase.toString(),
    bonusballPoolStepUnits: formatTokenAmount(
      config.bonusballPoolStepUnits,
      decimals
    ),
    maxGuaranteePerRoundBps: config.maxGuaranteePerRoundBps.toString(),
    lpPoolCap: formatTokenAmount(config.lpPoolCap, decimals),
    untakenTierDestination:
      config.untakenTierDestination === UntakenTierDestination.LpPool
        ? "lpPool"
        : "nextRound",
  };
}

function parseTierMinPayouts(value: string, decimals: number): bigint[] {
  const arr = value.split(",").map((v) => parseTokenAmount(v.trim(), decimals));
  if (arr.length !== TIER_COUNT)
    throw new Error(`Tier minimum payouts must have exactly ${TIER_COUNT} values.`);
  return arr;
}

function parseTierPremiumWeights(value: string): number[] {
  const arr = value.split(",").map((v) => Number(v.trim()));
  if (arr.length !== TIER_COUNT)
    throw new Error(`Tier weights must have exactly ${TIER_COUNT} values.`);
  if (arr.some((v) => !Number.isFinite(v) || v < 0))
    throw new Error("Tier weights must be non-negative integers.");
  return arr;
}

function parseTierIsWinning(value: string): boolean[] {
  const arr = value.split(",").map((v) => {
    const s = v.trim().toLowerCase();
    if (s === "1" || s === "true" || s === "y") return true;
    if (s === "0" || s === "false" || s === "n") return false;
    throw new Error(`Invalid tierIsWinning value: ${v}`);
  });
  if (arr.length !== TIER_COUNT)
    throw new Error(`tierIsWinning must have exactly ${TIER_COUNT} values.`);
  return arr;
}

export function formToConfigParams(
  form: ConfigForm,
  decimals: number
): ConfigParamsArgs {
  const tierMin = parseTierMinPayouts(form.tierMinPayoutPerWinner, decimals);
  const tierWeights = parseTierPremiumWeights(form.tierPremiumWeightBps);
  const tierWinning = parseTierIsWinning(form.tierIsWinning);
  return {
    defaultTicketPrice: parseTokenAmount(form.defaultTicketPrice, decimals),
    defaultRoundDurationSecs: BigInt(form.defaultRoundDurationSecs),
    guaranteedPrizePool: parseTokenAmount(form.guaranteedPrizePool, decimals),
    maxGuaranteePerRoundBps: Number(form.maxGuaranteePerRoundBps),
    drawTimeoutSlots: BigInt(form.drawTimeoutSlots),
    normalBallMax: Number(form.normalBallMax),
    bonusballMax: Number(form.bonusballMax),
    lpEdgeBps: Number(form.lpEdgeBps),
    referralFeeFirstBps: Number(form.referralFeeFirstBps),
    referralFeeSecondBps: Number(form.referralFeeSecondBps),
    referralWinShareFirstBps: Number(form.referralWinShareFirstBps),
    referralWinShareSecondBps: Number(form.referralWinShareSecondBps),
    lpPoolCap: parseTokenAmount(form.lpPoolCap, decimals),
    tierPremiumWeightBps: tierWeights,
    tierMinPayoutPerWinner: tierMin,
    tierIsWinning: tierWinning,
    premiumMinAllocationBps: Number(form.premiumMinAllocationBps),
    untakenTierDestination:
      form.untakenTierDestination === "lpPool"
        ? UntakenTierDestination.LpPool
        : UntakenTierDestination.NextRound,
    dynamicBonusballEnabled: form.dynamicBonusballEnabled,
    bonusballBase: Number(form.bonusballBase),
    bonusballPoolStepUnits: parseTokenAmount(
      form.bonusballPoolStepUnits,
      decimals
    ),
  };
}

/**
 * Form state hook for ConfigParams. Tracks dirty state so the editor knows
 * whether to enable Update; `resetFromChain()` re-syncs from the live config.
 */
export function useConfigForm(
  chainConfig: Config | undefined,
  decimals: number
) {
  const [form, setForm] = useState<ConfigForm>(DEFAULT_CONFIG_FORM);
  const [dirty, setDirty] = useState(false);
  const [pristineFromChain, setPristineFromChain] = useState(false);

  useEffect(() => {
    if (chainConfig && !pristineFromChain) {
      setForm(configToForm(chainConfig, decimals));
      setPristineFromChain(true);
      setDirty(false);
    }
  }, [chainConfig, decimals, pristineFromChain]);

  const update = useCallback(
    <K extends keyof ConfigForm>(key: K, value: ConfigForm[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setDirty(true);
    },
    []
  );

  const resetFromChain = useCallback(() => {
    if (chainConfig) {
      setForm(configToForm(chainConfig, decimals));
    } else {
      setForm(DEFAULT_CONFIG_FORM);
    }
    setDirty(false);
  }, [chainConfig, decimals]);

  return { form, update, dirty, resetFromChain };
}
