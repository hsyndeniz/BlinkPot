"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  address as parseAddress,
  type Address,
  type ReadonlyUint8Array,
  type TransactionSigner,
} from "@solana/kit";
import {
  RoundState,
  UntakenTierDestination,
  fetchMaybeBuyerEntry,
  fetchMaybeReferral,
  fetchMaybeSubscription,
  getArchiveRoundInstructionAsync,
  getCancelSubscriptionInstructionAsync,
  getClaimReferralFeesInstructionAsync,
  getClaimWinningsInstructionAsync,
  getCommitDrawInstructionAsync,
  getEmergencyLpWithdrawInstructionAsync,
  getEmergencyRefundTicketInstructionAsync,
  getEnterRoundEmergencyInstructionAsync,
  getInitializeConfigInstructionAsync,
  getInitializeReferralInstructionAsync,
  getLpDepositInstructionAsync,
  getLpFinalizeWithdrawInstructionAsync,
  getLpInitiateWithdrawInstructionAsync,
  getRevealDrawInstructionAsync,
  getSetEmergencyModeInstructionAsync,
  getSetPausedInstructionAsync,
  getStartRoundInstructionAsync,
  getSubscribeDailyInstructionAsync,
  getUpdateConfigInstructionAsync,
  type Config,
  type ConfigParamsArgs,
  type Round,
  type Ticket,
  type TicketPickArgs,
} from "../generated/lottery";
import { useWallet } from "../lib/wallet/context";
import { useCluster } from "./cluster-context";
import { ClusterSelect } from "./cluster-select";
import { GridBackground } from "./grid-background";
import { ThemeToggle } from "./theme-toggle";
import { WalletButton } from "./wallet-button";
import { ellipsify } from "../lib/explorer";
import { useSolanaClient } from "../lib/solana-client-context";
import {
  LOTTERY_PROGRAM_ID,
  findLpPrincipalPda,
  findBuyerEntryPda,
  findPrizeVaultPda,
  findPickCounterPda,
  findReferralPda,
  findRoundPda,
  findSubEscrowPda,
  findSubscriptionPda,
  pdaAddress,
} from "../lib/lottery/addresses";
import {
  useBuyerEntry,
  useConfig,
  useCurrentRound,
  useLpPosition,
  useLpVault,
  useReferral,
  useRound,
  useRounds,
  useSubscription,
  useTickets,
} from "../lib/lottery/accounts";
import { RoundSelect } from "./round-select";
import {
  findAta,
  formatTokenAmount,
  getCreateAtaInstruction,
  parseTokenAmount,
  useMint,
  useTokenAccount,
  useTokenAccountAddress,
  useTokenSymbol,
} from "../lib/lottery/tokens";
import {
  buildBuyTicketsInstruction,
  buildProcessSubscriptionInstruction,
} from "../lib/lottery/builders";
import { useSendLotteryTransaction } from "../lib/lottery/transactions";
import {
  countTicketMatches,
  isWinningTicket,
  tierForMatch,
} from "../lib/lottery/tally";
import {
  buildCreateRandomnessInstruction,
  buildSwitchboardCommitInstruction,
  buildSwitchboardRevealInstruction,
} from "../lib/lottery/randomness";

const SYSTEM_PROGRAM_ADDRESS = "11111111111111111111111111111111" as Address;
const TICKET_BATCH_LIMIT = 30;

type TabId =
  | "overview"
  | "player"
  | "lp"
  | "referral"
  | "subscription"
  | "admin"
  | "operations"
  | "explorer";

type ConfigForm = {
  defaultTicketPrice: string;
  defaultRoundDurationSecs: string;
  guaranteedPrizePool: string;
  drawTimeoutSlots: string;
  normalBallMax: string;
  bonusballMax: string;
  lpEdgeBps: string;
  referralFeeFirstBps: string; // 8%
  referralFeeSecondBps: string; // 2%
  referralWinShareFirstBps: string; // 8%
  referralWinShareSecondBps: string; // 2%
  tierMinPayoutPerWinner: string; // CSV of 12 values (USDC)
  tierPremiumWeightBps: string; // CSV of 12 values (sum to 10000)
  tierIsWinning: string; // CSV of 12 boolean values (0 or 1)
  premiumMinAllocationBps: string; // 20% floor e.g. 2000
  dynamicBonusballEnabled: boolean;
  bonusballBase: string; // e.g. 5
  bonusballPoolStepUnits: string; // e.g. 10000
  maxGuaranteePerRoundBps: string; // e.g. 3000 (30% NAV cap)
  lpPoolCap: string;
  // tierPayoutBps removed (deprecated)
  untakenTierDestination: "nextRound" | "lpPool";
};

const defaultConfigForm: ConfigForm = {
  defaultTicketPrice: "1",
  defaultRoundDurationSecs: "86400",
  guaranteedPrizePool: "1000", // $1k bootstrap
  drawTimeoutSlots: "10",
  normalBallMax: "30",
  bonusballMax: "15",
  lpEdgeBps: "2000", // 20% (was 9000)
  referralFeeFirstBps: "800", // 8%
  referralFeeSecondBps: "200", // 2%
  referralWinShareFirstBps: "800", // 8%
  referralWinShareSecondBps: "200", // 2%
  // Tier payouts: Megapot-aligned with free tickets for retention
  // Non-winning tiers (Tier 0, Tier 2 / 1 normal only): $0
  // Free ticket tiers (Tier 1 bonusball, Tier 4 2-normals): $1
  // Small payout tiers (Tier 3 1N+B): $2
  tierMinPayoutPerWinner: "0,1,0,2,1,2,5,10,25,50,100,0",
  tierPremiumWeightBps: "0,0,0,1200,0,1200,1200,600,600,600,600,4000",
  tierIsWinning: "0,1,0,1,1,1,1,1,1,1,1,1", // Megapot: tiers 0 and 2 are non-winning
  premiumMinAllocationBps: "2000", // 20%
  dynamicBonusballEnabled: true,
  bonusballBase: "5",
  bonusballPoolStepUnits: "10000", // $10k step
  maxGuaranteePerRoundBps: "3000", // 30% cap
  lpPoolCap: "0",
  // tierPayoutBps default removed
  untakenTierDestination: "nextRound",
};

const tabs: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "player", label: "Player" },
  { id: "lp", label: "LP" },
  { id: "referral", label: "Referral" },
  { id: "subscription", label: "Subscription" },
  { id: "admin", label: "Admin" },
  { id: "operations", label: "Operations" },
  { id: "explorer", label: "Explorer" },
];

function tryParseAddress(value: string): Address | undefined {
  try {
    return value.trim() ? parseAddress(value.trim()) : undefined;
  } catch {
    return undefined;
  }
}

function asAddress(value: string): Address {
  return parseAddress(value.trim());
}

function stateName(state?: RoundState): string {
  return state == null ? "No round" : RoundState[state];
}

function formatDate(value?: bigint): string {
  if (!value || value <= 0n) return "-";
  return new Date(Number(value) * 1000).toLocaleString();
}

function formatDuration(seconds?: number): string {
  if (seconds == null) return "-";
  if (seconds <= 0) return "ready";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${rest}s`;
  return `${rest}s`;
}

function ballsToString(values: ReadonlyUint8Array | number[]): string {
  return Array.from(values).join(", ");
}

function ticketPayoutEstimate(
  round: Round | undefined,
  ticket: Ticket
): bigint {
  if (!round) return 0n;
  const { matches, hasBonusball } = countTicketMatches(round, ticket);
  const tier = tierForMatch(matches, hasBonusball);
  if (!round.tierIsWinning[tier]) return 0n;
  // Returns the per-combo allocation — the actual claim payout is this divided
  // by the PickCounter.count for the ticket's pick. We don't fetch the counter
  // here so the displayed value is an upper bound (exact when the user is the
  // sole holder of the winning combo, otherwise the user gets per_combo / N).
  return round.perComboPayout[tier] ?? 0n;
}

function tokenAmountToLpShares(
  amount: bigint,
  totalAssets?: bigint,
  totalShares?: bigint
): bigint {
  if (amount <= 0n) return 0n;
  if (
    !totalAssets ||
    !totalShares ||
    totalAssets === 0n ||
    totalShares === 0n
  ) {
    throw new Error("LP vault is not ready for withdrawals yet.");
  }
  return (amount * totalShares) / totalAssets;
}

// Extended config type that includes fields added by the Megapot refactor.
// The Codama-generated Config type will gain these once the IDL is regenerated
// from the updated Anchor program; until then we widen via intersection.
type ExtendedConfig = Config & {
  referralFeeFirstBps?: number;
  referralFeeSecondBps?: number;
  referralWinShareFirstBps?: number;
  referralWinShareSecondBps?: number;
  tierMinPayoutPerWinner?: bigint[];
  tierPremiumWeightBps?: number[];
  premiumMinAllocationBps?: number;
  dynamicBonusballEnabled?: boolean;
  bonusballBase?: number;
  bonusballPoolStepUnits?: bigint;
  maxGuaranteePerRoundBps?: number;
};

function configToForm(rawConfig: Config, decimals: number): ConfigForm {
  const config = rawConfig as ExtendedConfig;
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
    referralFeeFirstBps: config.referralFeeFirstBps?.toString() ?? "800",
    referralFeeSecondBps: config.referralFeeSecondBps?.toString() ?? "200",
    referralWinShareFirstBps:
      config.referralWinShareFirstBps?.toString() ?? "800",
    referralWinShareSecondBps:
      config.referralWinShareSecondBps?.toString() ?? "200",
    tierMinPayoutPerWinner: config.tierMinPayoutPerWinner
      ? config.tierMinPayoutPerWinner
          .map((v) => formatTokenAmount(v, decimals))
          .join(",")
      : "0,0,0,0.5,0,1,2,5,10,25,100,0",
    tierPremiumWeightBps:
      config.tierPremiumWeightBps?.join(",") ??
      "0,0,0,1200,0,1200,1200,600,600,600,600,4000",
    tierIsWinning:
      config.tierIsWinning?.map((v) => (v ? "1" : "0")).join(",") ??
      "0,1,0,1,1,1,1,1,1,1,1,1",
    premiumMinAllocationBps:
      config.premiumMinAllocationBps?.toString() ?? "2000",
    dynamicBonusballEnabled: config.dynamicBonusballEnabled ?? true,
    bonusballBase: config.bonusballBase?.toString() ?? "5",
    bonusballPoolStepUnits: formatTokenAmount(
      config.bonusballPoolStepUnits ?? BigInt(10_000_000_000),
      decimals
    ),
    maxGuaranteePerRoundBps:
      config.maxGuaranteePerRoundBps?.toString() ?? "3000",
    lpPoolCap: formatTokenAmount(config.lpPoolCap, decimals),
    // deprecated tierPayoutBps removed from config mapping
    untakenTierDestination:
      config.untakenTierDestination === UntakenTierDestination.LpPool
        ? "lpPool"
        : "nextRound",
  };
}

// deprecated tierPayoutBps parsing removed (use tierPremiumWeightBps + tierMinPayoutPerWinner)

function parseTierMinPayouts(value: string, decimals: number): bigint[] {
  const parsed = value
    .split(",")
    .map((item) => parseTokenAmount(item.trim(), decimals))
    .filter((item) => item >= 0n);
  if (parsed.length !== 12) {
    throw new Error("Tier minimum payouts must contain exactly 12 values.");
  }
  return parsed;
}

function parseTierPremiumWeights(value: string): number[] {
  const parsed = value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));
  if (parsed.length !== 12) {
    throw new Error("Tier premium weights must contain exactly 12 values.");
  }
  if (parsed.some((item) => item < 0 || item > 10_000)) {
    throw new Error("Tier premium weights must be between 0 and 10000.");
  }
  const sum = parsed.reduce((a, b) => a + b, 0);
  if (sum !== 10_000) {
    throw new Error(`Tier premium weights must sum to 10000 (got ${sum}).`);
  }
  return parsed;
}

function parseTierIsWinning(value: string): boolean[] {
  const parsed = value
    .split(",")
    .map((item) => {
      const trimmed = item.trim();
      if (trimmed === "0" || trimmed.toLowerCase() === "false") return false;
      if (trimmed === "1" || trimmed.toLowerCase() === "true") return true;
      return null;
    })
    .filter((item) => item !== null) as boolean[];
  if (parsed.length !== 12) {
    throw new Error("Tier is-winning flags must contain exactly 12 values.");
  }
  return parsed;
}

function formToConfigParams(
  form: ConfigForm,
  decimals: number
): ConfigParamsArgs {
  const premiumMinAllocationBps = Number(
    form.premiumMinAllocationBps || "2000"
  );
  if (premiumMinAllocationBps < 0 || premiumMinAllocationBps > 10_000) {
    throw new Error("Premium minimum allocation must be between 0 and 10000.");
  }

  const lpEdgeBps = Number(form.lpEdgeBps);
  const referralFeeFirstBps = Number(form.referralFeeFirstBps);
  const referralFeeSecondBps = Number(form.referralFeeSecondBps);
  const totalFeeBps = lpEdgeBps + referralFeeFirstBps + referralFeeSecondBps;
  if (totalFeeBps > 10_000) {
    throw new Error(
      `LP edge + referral fees must not exceed 10000 bps (got ${totalFeeBps}).`
    );
  }

  return {
    defaultTicketPrice: parseTokenAmount(form.defaultTicketPrice, decimals),
    defaultRoundDurationSecs: BigInt(form.defaultRoundDurationSecs || "0"),
    guaranteedPrizePool: parseTokenAmount(form.guaranteedPrizePool, decimals),
    drawTimeoutSlots: BigInt(form.drawTimeoutSlots || "0"),
    normalBallMax: Number(form.normalBallMax),
    bonusballMax: Number(form.bonusballMax),
    lpEdgeBps,
    referralFeeFirstBps,
    referralFeeSecondBps,
    referralWinShareFirstBps: Number(form.referralWinShareFirstBps),
    referralWinShareSecondBps: Number(form.referralWinShareSecondBps),
    tierMinPayoutPerWinner: parseTierMinPayouts(
      form.tierMinPayoutPerWinner,
      decimals
    ),
    tierPremiumWeightBps: parseTierPremiumWeights(form.tierPremiumWeightBps),
    tierIsWinning: parseTierIsWinning(form.tierIsWinning),
    premiumMinAllocationBps,
    dynamicBonusballEnabled: form.dynamicBonusballEnabled,
    bonusballBase: Number(form.bonusballBase),
    bonusballPoolStepUnits: parseTokenAmount(
      form.bonusballPoolStepUnits,
      decimals
    ),
    maxGuaranteePerRoundBps: Number(form.maxGuaranteePerRoundBps),
    lpPoolCap: parseTokenAmount(form.lpPoolCap, decimals),
    // deprecated field removed
    untakenTierDestination:
      form.untakenTierDestination === "lpPool"
        ? UntakenTierDestination.LpPool
        : UntakenTierDestination.NextRound,
  } as unknown as ConfigParamsArgs; // Extended fields not yet in generated type; safe cast
}

function parseManualPick(
  normalsInput: string,
  bonusInput: string,
  normalMax: number,
  bonusMax: number
): TicketPickArgs {
  const normals = normalsInput
    .split(/[,\s]+/)
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item))
    .sort((a, b) => a - b);
  const bonusball = Number(bonusInput);

  if (normals.length !== 5) {
    throw new Error("Pick exactly five normal balls.");
  }
  if (new Set(normals).size !== normals.length) {
    throw new Error("Normal balls must be unique.");
  }
  if (normals.some((item) => item < 1 || item > normalMax)) {
    throw new Error(`Normal balls must be between 1 and ${normalMax}.`);
  }
  if (!Number.isInteger(bonusball) || bonusball < 1 || bonusball > bonusMax) {
    throw new Error(`Bonusball must be between 1 and ${bonusMax}.`);
  }

  return {
    normals: new Uint8Array(normals),
    bonusball,
  };
}

function quickPick(normalMax: number, bonusMax: number): TicketPickArgs {
  const pool = Array.from({ length: normalMax }, (_, index) => index + 1);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return {
    normals: new Uint8Array(pool.slice(0, 5).sort((a, b) => a - b)),
    bonusball: Math.floor(Math.random() * bonusMax) + 1,
  };
}

function isDefaultAddress(value?: Address): boolean {
  return !value || value === SYSTEM_PROGRAM_ADDRESS;
}

function getRandomnessStorageKey(
  cluster: string,
  roundId?: bigint
): string | undefined {
  return roundId
    ? `megapot:randomness:${cluster}:${roundId.toString()}`
    : undefined;
}

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-muted">
      {props.label}
      <input
        type={props.type ?? "text"}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
        className="h-9 rounded-lg border border-border-low bg-card px-3 text-sm text-foreground outline-none transition focus:border-foreground/30"
      />
    </label>
  );
}

function SelectField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-muted">
      {props.label}
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="h-9 rounded-lg border border-border-low bg-card px-3 text-sm text-foreground outline-none transition focus:border-foreground/30"
      >
        {props.children}
      </select>
    </label>
  );
}

function ActionButton(props: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
}) {
  const variant = props.variant ?? "secondary";
  const className =
    variant === "primary"
      ? "bg-primary text-primary-foreground hover:bg-primary/90"
      : variant === "danger"
        ? "border border-destructive/30 text-destructive hover:bg-destructive/10"
        : "border border-border-low bg-card hover:bg-cream";

  return (
    <button
      type={props.type ?? "button"}
      onClick={props.onClick}
      disabled={props.disabled}
      className={`h-9 cursor-pointer rounded-lg px-3 text-xs font-semibold transition disabled:pointer-events-none disabled:opacity-45 ${className}`}
    >
      {props.children}
    </button>
  );
}

function Panel(props: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border-low bg-card p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight">{props.title}</h2>
        {props.action}
      </div>
      {props.children}
    </section>
  );
}

function Metric(props: {
  label: string;
  value: React.ReactNode;
  subvalue?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border-low bg-background/60 px-3 py-3">
      <p className="text-xs text-muted">{props.label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{props.value}</p>
      {props.subvalue && (
        <p className="mt-1 text-xs text-muted">{props.subvalue}</p>
      )}
    </div>
  );
}

function StatusBadge(props: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const tone = props.tone ?? "neutral";
  const className =
    tone === "good"
      ? "border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-300"
      : tone === "warn"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : tone === "bad"
          ? "border-destructive/20 bg-destructive/10 text-destructive"
          : "border-border-low bg-cream text-foreground/70";

  return (
    <span
      className={`inline-flex rounded-lg border px-2 py-1 text-xs font-semibold ${className}`}
    >
      {props.children}
    </span>
  );
}

function DecimalsHeadsUp(props: { decimals: number; detected: boolean }) {
  return (
    <div className="rounded-lg border border-border-low bg-blue-50 dark:bg-blue-950/20 p-3 text-xs leading-relaxed text-foreground/80">
      <strong className="font-semibold text-foreground">
        Amount fields use the payment mint&rsquo;s base units.
      </strong>{" "}
      <span>
        Enter <em>whole-token amounts</em> (e.g. <code className="font-mono">1</code>{" "}
        for 1 token, <code className="font-mono">0.25</code> for ¼ token) for{" "}
        <span className="font-mono">defaultTicketPrice</span>,{" "}
        <span className="font-mono">guaranteedPrizePool</span>,{" "}
        <span className="font-mono">lpPoolCap</span>,{" "}
        <span className="font-mono">bonusballPoolStepUnits</span>, and{" "}
        <span className="font-mono">tierMinPayoutPerWinner</span>. They are converted
        to base units automatically using the mint&rsquo;s decimals — no manual
        scaling required.
      </span>{" "}
      {props.detected ? (
        <span>
          Detected:{" "}
          <span className="font-mono font-semibold text-foreground">
            {props.decimals} decimals
          </span>
          .
        </span>
      ) : (
        <span className="text-muted">
          Enter a mint address above to detect its decimals.
        </span>
      )}
    </div>
  );
}

function AddressLink(props: { address?: Address; label?: string }) {
  const { getExplorerUrl } = useCluster();
  if (!props.address) return <span className="text-muted">-</span>;
  return (
    <a
      href={getExplorerUrl(`/address/${props.address}`)}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-xs text-foreground underline underline-offset-4"
    >
      {props.label ?? ellipsify(props.address, 4)}
    </a>
  );
}

function ConfigFormFields(props: {
  form: ConfigForm;
  onChange: (form: ConfigForm) => void;
  symbol: string;
}) {
  const set = (key: keyof ConfigForm) => (value: string | boolean) =>
    props.onChange({ ...props.form, [key]: value });
  const { symbol } = props;

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {/* Basic parameters */}
      <Field
        label={`Ticket price (${symbol})`}
        value={props.form.defaultTicketPrice}
        onChange={set("defaultTicketPrice")}
      />
      <Field
        label="Round duration (seconds)"
        value={props.form.defaultRoundDurationSecs}
        onChange={set("defaultRoundDurationSecs")}
      />
      <Field
        label="Draw timeout (slots)"
        value={props.form.drawTimeoutSlots}
        onChange={set("drawTimeoutSlots")}
      />

      {/* Ball parameters */}
      <Field
        label="Normal ball max"
        value={props.form.normalBallMax}
        onChange={set("normalBallMax")}
      />
      <Field
        label="Bonusball max"
        value={props.form.bonusballMax}
        onChange={set("bonusballMax")}
      />
      <div></div>

      {/* Fee split (Epic 1) */}
      <h3 className="col-span-3 mt-2 text-sm font-semibold">
        Fee Split (Megapot-aligned)
      </h3>
      <Field
        label="LP edge bps (20%)"
        value={props.form.lpEdgeBps}
        onChange={set("lpEdgeBps")}
      />
      <Field
        label="Referral fee 1st bps (8%)"
        value={props.form.referralFeeFirstBps}
        onChange={set("referralFeeFirstBps")}
      />
      <Field
        label="Referral fee 2nd bps (2%)"
        value={props.form.referralFeeSecondBps}
        onChange={set("referralFeeSecondBps")}
      />
      <Field
        label="Referral win share 1st bps (8%)"
        value={props.form.referralWinShareFirstBps}
        onChange={set("referralWinShareFirstBps")}
      />
      <Field
        label="Referral win share 2nd bps (2%)"
        value={props.form.referralWinShareSecondBps}
        onChange={set("referralWinShareSecondBps")}
      />
      <div></div>

      {/* Tier redesign (Epic 2) */}
      <h3 className="col-span-3 mt-2 text-sm font-semibold">
        Tier Math (Guaranteed Min + Premium)
      </h3>
      <label className="grid gap-1 text-xs font-medium text-muted md:col-span-2">
        Tier min payout per winner ({symbol}, CSV)
        <textarea
          value={props.form.tierMinPayoutPerWinner}
          onChange={(event) =>
            set("tierMinPayoutPerWinner")(event.target.value)
          }
          rows={2}
          placeholder="0,0,0,0.5,0,1,2,5,10,25,100,0"
          className="rounded-lg border border-border-low bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-foreground/30"
        />
      </label>
      <div></div>
      <label className="grid gap-1 text-xs font-medium text-muted md:col-span-2">
        Tier premium weights bps (sum to 10000)
        <textarea
          value={props.form.tierPremiumWeightBps}
          onChange={(event) => set("tierPremiumWeightBps")(event.target.value)}
          rows={2}
          placeholder="0,0,0,1200,0,1200,1200,600,600,600,600,4000"
          className="rounded-lg border border-border-low bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-foreground/30"
        />
      </label>
      <div></div>
      <Field
        label="Premium min allocation bps (20% floor)"
        value={props.form.premiumMinAllocationBps}
        onChange={set("premiumMinAllocationBps")}
      />
      <div></div>
      <div></div>

      {/* Dynamic bonusball (Epic 5) */}
      <h3 className="col-span-3 mt-2 text-sm font-semibold">
        Dynamic Bonusball
      </h3>
      <label className="flex items-center gap-2 text-xs font-medium text-muted">
        <input
          type="checkbox"
          checked={props.form.dynamicBonusballEnabled}
          onChange={(e) => set("dynamicBonusballEnabled")(e.target.checked)}
          className="rounded border border-border-low"
        />
        Enable dynamic bonusball
      </label>
      <Field
        label="Bonusball base (min range)"
        value={props.form.bonusballBase}
        onChange={set("bonusballBase")}
      />
      <Field
        label={`Bonusball pool step (${symbol})`}
        value={props.form.bonusballPoolStepUnits}
        onChange={set("bonusballPoolStepUnits")}
      />

      {/* Guaranteed pool (Epic 4) */}
      <h3 className="col-span-3 mt-2 text-sm font-semibold">
        Guaranteed Prize Pool
      </h3>
      <Field
        label={`Guaranteed prize pool (${symbol})`}
        value={props.form.guaranteedPrizePool}
        onChange={set("guaranteedPrizePool")}
      />
      <Field
        label="Max guarantee per round bps (30% cap)"
        value={props.form.maxGuaranteePerRoundBps}
        onChange={set("maxGuaranteePerRoundBps")}
      />
      <div></div>

      {/* Other parameters */}
      <h3 className="col-span-3 mt-2 text-sm font-semibold">Other</h3>
      <Field
        label={`LP pool cap (${symbol})`}
        value={props.form.lpPoolCap}
        onChange={set("lpPoolCap")}
      />
      <SelectField
        label="Untaken tier destination"
        value={props.form.untakenTierDestination}
        onChange={(value) =>
          props.onChange({
            ...props.form,
            untakenTierDestination: value === "lpPool" ? "lpPool" : "nextRound",
          })
        }
      >
        <option value="nextRound">Next round</option>
        <option value="lpPool">LP pool</option>
      </SelectField>
      <div></div>
      {/* deprecated tierPayoutBps removed */}
    </div>
  );
}

function useProgramTokenAddresses(paymentMint?: Address, owner?: Address) {
  const { cluster } = useCluster();

  return useSWR(
    paymentMint
      ? ([
          "lottery",
          "pdas",
          "programTokens",
          cluster,
          paymentMint,
          owner ?? "",
        ] as const)
      : null,
    async ([, , , , mint, wallet]) => {
      const [prizeVault, lpPrincipal] = await Promise.all([
        findPrizeVaultPda({ paymentMint: mint }).then(pdaAddress),
        findLpPrincipalPda({ paymentMint: mint }).then(pdaAddress),
      ]);
      const subEscrow = wallet
        ? await findSubEscrowPda({
            owner: wallet as Address,
            paymentMint: mint,
          }).then(pdaAddress)
        : undefined;
      return { prizeVault, lpPrincipal, subEscrow };
    },
    { revalidateOnFocus: false }
  );
}

function useNowSeconds() {
  const [nowSeconds, setNowSeconds] = useState<number>();

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowSeconds(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  return nowSeconds;
}

export function LotteryConsole() {
  const { signer, wallet, status } = useWallet();
  const { cluster } = useCluster();
  const client = useSolanaClient();
  const { send, isSending } = useSendLotteryTransaction();

  const walletAddress = signer?.address ?? wallet?.account.address;
  const configState = useConfig();
  const config = configState.config;
  const currentRound = useCurrentRound();
  const [selectedRoundId, setSelectedRoundId] = useState<string | undefined>();
  const selectedRound = useRound(
    selectedRoundId ? BigInt(selectedRoundId) : undefined
  );
  const round = selectedRound.round ?? currentRound.round;
  const roundAddress = selectedRound.address ?? currentRound.address;
  const roundId = round?.roundId;
  const rounds = useRounds();
  const lpVault = useLpVault();
  const lpPosition = useLpPosition(walletAddress);
  const referral = useReferral(walletAddress);
  const subscription = useSubscription(walletAddress);
  const buyerEntry = useBuyerEntry(roundId, walletAddress);
  const tickets = useTickets(roundId, walletAddress);

  // DEBUG: Log ticket data
  useEffect(() => {
    console.log("=== TICKET DEBUG ===");
    console.log("Wallet Address:", walletAddress);
    console.log("Selected Round ID:", selectedRoundId);
    console.log("Current Round ID:", currentRound.round?.roundId?.toString());
    console.log("Active Round ID:", roundId?.toString());
    console.log("Buyer Entry Address:", buyerEntry.address);
    console.log("Buyer Entry Exists:", buyerEntry.exists);
    console.log("Buyer Entry Data:", buyerEntry.buyerEntry);
    console.log(
      "Buyer Entry Ticket Count:",
      buyerEntry.buyerEntry?.ticketCount?.toString()
    );
    console.log("Buyer Entry Loading:", buyerEntry.isLoading);
    console.log("Buyer Entry Validating:", buyerEntry.isValidating);
    console.log("Tickets Data:", tickets);
    console.log("Tickets Array Length:", tickets.tickets?.length);
    console.log("Tickets Addresses Length:", tickets.addresses?.length);
    console.log(
      "Available Rounds:",
      rounds.rounds?.map((r) => r.data?.roundId?.toString())
    );
    console.log("===================");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    walletAddress,
    selectedRoundId,
    roundId,
    buyerEntry.exists,
    buyerEntry.buyerEntry?.ticketCount,
    buyerEntry.isLoading,
    tickets.tickets?.length,
    rounds.rounds?.length,
  ]);
  const mintInfo = useMint(config?.paymentMint);
  const userPaymentAccount = useTokenAccount(walletAddress, config?.paymentMint);
  const programTokens = useProgramTokenAddresses(
    config?.paymentMint,
    walletAddress
  );
  const prizeVaultBalance = useTokenAccountAddress(
    programTokens.data?.prizeVault,
    config?.paymentMint
  );
  const lpPrincipalBalance = useTokenAccountAddress(
    programTokens.data?.lpPrincipal,
    config?.paymentMint
  );
  const subEscrowBalance = useTokenAccountAddress(
    programTokens.data?.subEscrow,
    config?.paymentMint
  );

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [busyAction, setBusyAction] = useState<string | undefined>();
  const [configForm, setConfigForm] = useState<ConfigForm>(defaultConfigForm);
  const [configFormDirty, setConfigFormDirty] = useState(false);
  const [setupMintInput, setSetupMintInput] = useState("");
  const setupMintAddress = useMemo(
    () => tryParseAddress(setupMintInput),
    [setupMintInput]
  );
  const setupMint = useMint(setupMintAddress);
  const [ticketFilter, setTicketFilter] = useState<
    "all" | "winning" | "losing"
  >("all");
  const [normalInput, setNormalInput] = useState("1,2,3,4,5");
  const [bonusInput, setBonusInput] = useState("1");
  const [batchCountInput, setBatchCountInput] = useState("1");
  const [referrerInput, setReferrerInput] = useState("");
  const [lpDepositInput, setLpDepositInput] = useState("");
  const [lpWithdrawInput, setLpWithdrawInput] = useState("");
  const [subscriptionDaysInput, setSubscriptionDaysInput] = useState("7");
  const [subscriptionCountInput, setSubscriptionCountInput] = useState("1");
  const [subscriptionOwnerInput, setSubscriptionOwnerInput] = useState("");
  const [referralParentInput, setReferralParentInput] = useState("");
  const [startTicketPriceInput, setStartTicketPriceInput] = useState("1");
  const [startDurationInput, setStartDurationInput] = useState("86400");
  const [startBonusMaxInput, setStartBonusMaxInput] = useState("15");
  const [startGuaranteedPoolInput, setStartGuaranteedPoolInput] = useState("");
  const [randomnessDraft, setRandomnessDraft] = useState<{
    key?: string;
    value: string;
  }>({ value: "" });
  const nowSeconds = useNowSeconds();

  const isAdmin = !!(config && walletAddress && config.admin === walletAddress);
  const decimals = mintInfo.decimals;
  // Best-effort symbol for the configured payment mint (or the in-progress
  // setup mint when no config exists yet). Falls back to "tokens" for unknown
  // mints — see `useTokenSymbol` for the recognised mainnet mapping.
  const symbol = useTokenSymbol(
    config?.paymentMint ?? setupMintAddress ?? undefined
  );
  const effectiveConfigForm =
    config && !configFormDirty ? configToForm(config, decimals) : configForm;
  const handleConfigFormChange = (nextForm: ConfigForm) => {
    setConfigForm(nextForm);
    setConfigFormDirty(true);
  };
  const randomnessStorageKey = getRandomnessStorageKey(cluster, roundId);
  const storedRandomness = useSWR(
    randomnessStorageKey
      ? ([
          "lottery",
          "randomness-local",
          randomnessStorageKey,
          round?.randomnessAccount ?? "",
        ] as const)
      : null,
    async ([, , key, account]) => {
      const accountAddress = account as Address | "";
      const fallback =
        accountAddress && !isDefaultAddress(accountAddress)
          ? accountAddress
          : "";
      return typeof window === "undefined"
        ? fallback
        : (window.localStorage.getItem(key) ?? fallback);
    },
    { revalidateOnFocus: false }
  );
  const randomnessInput =
    randomnessDraft.key === randomnessStorageKey
      ? randomnessDraft.value
      : (storedRandomness.data ?? "");
  const setRandomnessInput = (value: string) => {
    setRandomnessDraft({ key: randomnessStorageKey, value });
  };
  const roundState = round?.state;
  const isMainnet = cluster === "mainnet";
  const drawRemaining =
    round?.drawTime && round.drawTime > 0n && nowSeconds != null
      ? Math.max(0, Number(round.drawTime) - nowSeconds)
      : undefined;
  const canBuy =
    status === "connected" &&
    !!config &&
    !!round &&
    round.state === RoundState.Open &&
    !config.paused &&
    !config.emergencyMode &&
    !isMainnet;
  const canCommit =
    cluster === "devnet" &&
    !!round &&
    !!roundAddress &&
    (round.state === RoundState.Drawing ||
      (round.state === RoundState.Open && (drawRemaining ?? 1) <= 0));
  const canReveal =
    cluster === "devnet" &&
    !!round &&
    !!roundAddress &&
    round.state === RoundState.Drawing &&
    !isDefaultAddress(round.randomnessAccount);

  const runAction = async (label: string, action: () => Promise<void>) => {
    setBusyAction(label);
    try {
      await action();
    } catch (err) {
      if (!(err && typeof err === "object" && "lotteryToastShown" in err)) {
        toast.error(label, {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    } finally {
      setBusyAction(undefined);
    }
  };

  const requireSigner = (): TransactionSigner => {
    if (!signer) throw new Error("Connect a wallet first.");
    return signer;
  };

  const requireConfig = (): Config => {
    if (!config) throw new Error("Lottery config is not initialized.");
    return config;
  };

  const requireRound = (): { round: Round; address: Address } => {
    if (!round || !roundAddress)
      throw new Error("No current round is available.");
    return { round, address: roundAddress };
  };

  const buildWalletAta = async (owner: TransactionSigner, mint: Address) => {
    const ata = await findAta(owner.address, mint);
    const createAta = await getCreateAtaInstruction({
      payer: owner,
      owner: owner.address,
      mint,
    });
    return { ata, createAta };
  };

  const validateOptionalReferrer = async (value: string) => {
    const referrer = tryParseAddress(value);
    if (!referrer) {
      return {
        referrer: undefined,
        referrerAccount: undefined,
        parentReferrerAccount: undefined,
      };
    }
    if (walletAddress && referrer === walletAddress) {
      throw new Error("Referrer cannot be the connected wallet.");
    }
    const referrerAccount = pdaAddress(await findReferralPda({ referrer }));
    const account = await fetchMaybeReferral(client.rpc, referrerAccount, {
      commitment: "confirmed",
    });
    if (!account.exists) throw new Error("Referrer PDA does not exist.");

    let parentReferrerAccount: Address | undefined;
    if (account.data.hasParent) {
      parentReferrerAccount = pdaAddress(
        await findReferralPda({ referrer: account.data.parentReferrer })
      );
    }
    return { referrer, referrerAccount, parentReferrerAccount };
  };

  const handleGenerateReferralLink = () =>
    runAction("Generate referral link", async () => {
      if (!walletAddress) {
        throw new Error("Connect a wallet first.");
      }
      const url = new URL(window.location.href);
      url.searchParams.set("referrer", walletAddress);
      const referralLink = url.toString();
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(referralLink);
        return;
      }
      window.prompt("Copy referral link", referralLink);
    });

  const handleQuickPick = () => {
    const normalMax = round?.normalBallMax ?? config?.normalBallMax ?? 30;
    const bonusMax = round?.bonusballMax ?? config?.bonusballMax ?? 15;
    const pick = quickPick(normalMax, bonusMax);
    setNormalInput(ballsToString(pick.normals));
    setBonusInput(pick.bonusball.toString());
  };

  const handleBuyTickets = () =>
    runAction("Buy tickets", async () => {
      const walletSigner = requireSigner();
      const cfg = requireConfig();
      const activeRound = requireRound();
      if (activeRound.round.state !== RoundState.Open) {
        throw new Error("Tickets can only be bought while the round is open.");
      }
      if (cfg.paused || cfg.emergencyMode) {
        throw new Error("Ticket buying is paused or emergency mode is active.");
      }

      const batchCount = Math.max(
        1,
        Math.min(TICKET_BATCH_LIMIT, Number(batchCountInput || "1"))
      );
      const firstPick = parseManualPick(
        normalInput,
        bonusInput,
        activeRound.round.normalBallMax,
        activeRound.round.bonusballMax
      );
      const picks = [firstPick];
      while (picks.length < batchCount) {
        picks.push(
          quickPick(
            activeRound.round.normalBallMax,
            activeRound.round.bonusballMax
          )
        );
      }

      const totalCost = activeRound.round.ticketPrice * BigInt(picks.length);
      if (userPaymentAccount.amount < totalCost) {
        throw new Error(`Insufficient ${symbol} balance for this ticket batch.`);
      }
      const { ata, createAta } = await buildWalletAta(
        walletSigner,
        cfg.paymentMint
      );
      const { referrer, referrerAccount, parentReferrerAccount } =
        await validateOptionalReferrer(referrerInput);
      const firstTicketIndex = buyerEntry.buyerEntry?.ticketCount ?? 0n;
      const built = await buildBuyTicketsInstruction({
        buyer: walletSigner,
        round: activeRound.address,
        roundId: activeRound.round.roundId,
        paymentMint: cfg.paymentMint,
        buyerTokenAccount: ata,
        picks,
        firstTicketIndex,
        referrer,
        referrerAccount,
        parentReferrerAccount,
      });

      await send({
        action: "Buy tickets",
        instructions: [createAta, built.instruction],
        expectedStateChange: `${picks.length} ticket account(s) created and buyer entry advanced.`,
        tokenAmount: formatTokenAmount(totalCost, decimals),
        touchedAccounts: [
          { label: "round", address: activeRound.address },
          { label: "buyer entry", address: built.buyerEntry },
          ...built.ticketPdas.map((address, index) => ({
            label: `ticket ${firstTicketIndex + BigInt(index)}`,
            address,
          })),
        ],
      });
    });

  const handleClaimTicket = (ticket: { address: Address; data: Ticket }) =>
    runAction("Claim winnings", async () => {
      const walletSigner = requireSigner();
      const cfg = requireConfig();
      const activeRound = requireRound();
      const { ata, createAta } = await buildWalletAta(
        walletSigner,
        cfg.paymentMint
      );
      const referrerAccount = ticket.data.hasReferrer
        ? pdaAddress(await findReferralPda({ referrer: ticket.data.referrer }))
        : undefined;
      const parentReferrerAccount = ticket.data.hasParentReferrer
        ? pdaAddress(
            await findReferralPda({ referrer: ticket.data.parentReferrer })
          )
        : undefined;
      // PickCounter PDA for this ticket's exact (normals, bonusball). Required by
      // claim_winnings — its `count` is the divisor that splits the per-combo
      // payout among duplicate winners on the same pick.
      const pickCounter = pdaAddress(
        await findPickCounterPda({
          roundId: ticket.data.roundId,
          normals: ticket.data.normals,
          bonusball: ticket.data.bonusball,
        })
      );
      const instruction = await getClaimWinningsInstructionAsync({
        owner: walletSigner,
        round: activeRound.address,
        ticket: ticket.address,
        pickCounter,
        paymentMint: cfg.paymentMint,
        winnerTokenAccount: ata,
        referrerAccount,
        parentReferrerAccount,
      });
      await send({
        action: "Claim winnings",
        instructions: [createAta, instruction],
        expectedStateChange:
          "Ticket is marked claimed and payout is transferred.",
        touchedAccounts: [
          { label: "round", address: activeRound.address },
          { label: "ticket", address: ticket.address },
          { label: "winner ATA", address: ata },
        ],
      });
    });

  const handleEmergencyRefund = (ticket: { address: Address; data: Ticket }) =>
    runAction("Emergency refund", async () => {
      const walletSigner = requireSigner();
      const cfg = requireConfig();
      const activeRound = requireRound();
      if (
        !cfg.emergencyMode &&
        activeRound.round.state !== RoundState.Emergency
      ) {
        throw new Error(
          "Emergency refunds require global or round emergency mode."
        );
      }
      const { ata, createAta } = await buildWalletAta(
        walletSigner,
        cfg.paymentMint
      );
      const referrerAccount = ticket.data.hasReferrer
        ? pdaAddress(await findReferralPda({ referrer: ticket.data.referrer }))
        : undefined;
      const parentReferrerAccount = ticket.data.hasParentReferrer
        ? pdaAddress(
            await findReferralPda({ referrer: ticket.data.parentReferrer })
          )
        : undefined;
      const instruction = await getEmergencyRefundTicketInstructionAsync({
        owner: walletSigner,
        round: activeRound.address,
        ticket: ticket.address,
        paymentMint: cfg.paymentMint,
        ownerTokenAccount: ata,
        referrerAccount,
        parentReferrerAccount,
      });
      await send({
        action: "Emergency refund",
        instructions: [createAta, instruction],
        expectedStateChange: "Ticket is refunded through the emergency path.",
        touchedAccounts: [
          { label: "round", address: activeRound.address },
          { label: "ticket", address: ticket.address },
          { label: "owner ATA", address: ata },
        ],
      });
    });

  const handleLpDeposit = () =>
    runAction("LP deposit", async () => {
      const walletSigner = requireSigner();
      const cfg = requireConfig();
      const amount = parseTokenAmount(lpDepositInput, decimals);
      if (amount <= 0n) throw new Error("Enter a deposit amount.");
      if (userPaymentAccount.amount < amount)
        throw new Error(`Insufficient ${symbol} balance.`);
      const { ata, createAta } = await buildWalletAta(
        walletSigner,
        cfg.paymentMint
      );
      const instruction = await getLpDepositInstructionAsync({
        owner: walletSigner,
        paymentMint: cfg.paymentMint,
        ownerTokenAccount: ata,
        amount,
      });
      await send({
        action: "LP deposit",
        instructions: [createAta, instruction],
        expectedStateChange:
          "LP position receives pool shares and LP principal increases.",
        tokenAmount: formatTokenAmount(amount, decimals),
        touchedAccounts: [
          { label: "LP vault", address: lpVault.address! },
          {
            label: "LP position",
            address: lpPosition.address ?? walletSigner.address,
          },
        ],
      });
    });

  const handleLpInitiateWithdraw = () =>
    runAction("Initiate LP withdraw", async () => {
      const walletSigner = requireSigner();
      const amount = parseTokenAmount(lpWithdrawInput || "0", decimals);
      if (amount <= 0n) throw new Error(`Enter a ${symbol} amount.`);
      const position = lpPosition.position;
      if (!position) throw new Error("No LP position is available.");
      const vault = lpVault.lpVault;
      const shares = tokenAmountToLpShares(
        amount,
        vault?.totalAssets,
        vault?.totalShares
      );
      if (shares <= 0n) {
        throw new Error("Amount is too small to convert into LP shares.");
      }
      if (shares > position.shares) {
        throw new Error("Amount exceeds your LP position.");
      }
      const instruction = await getLpInitiateWithdrawInstructionAsync({
        owner: walletSigner,
        shares,
      });
      await send({
        action: "Initiate LP withdraw",
        instructions: [instruction],
        expectedStateChange:
          `${symbol} amount is converted to LP shares and moved to pending withdrawal.`,
        touchedAccounts: [
          { label: "LP vault", address: lpVault.address! },
          {
            label: "LP position",
            address: lpPosition.address ?? walletSigner.address,
          },
        ],
      });
    });

  const handleLpFinalizeWithdraw = () =>
    runAction("Finalize LP withdraw", async () => {
      const walletSigner = requireSigner();
      const cfg = requireConfig();
      const position = lpPosition.position;
      if (!position || position.pendingWithdrawShares === 0n) {
        throw new Error("No pending withdrawal is available.");
      }
      const { ata, createAta } = await buildWalletAta(
        walletSigner,
        cfg.paymentMint
      );
      const pendingRound = pdaAddress(
        await findRoundPda(position.pendingWithdrawRound)
      );
      const instruction = await getLpFinalizeWithdrawInstructionAsync({
        owner: walletSigner,
        pendingRound,
        paymentMint: cfg.paymentMint,
        ownerTokenAccount: ata,
      });
      await send({
        action: "Finalize LP withdraw",
        instructions: [createAta, instruction],
        expectedStateChange:
          "Pending LP withdrawal is paid to the owner token account.",
        touchedAccounts: [
          { label: "pending round", address: pendingRound },
          { label: "owner ATA", address: ata },
        ],
      });
    });

  const handleEmergencyLpWithdraw = () =>
    runAction("Emergency LP withdraw", async () => {
      const walletSigner = requireSigner();
      const cfg = requireConfig();
      if (!cfg.emergencyMode) {
        throw new Error("Global emergency mode is not active.");
      }
      const { ata, createAta } = await buildWalletAta(
        walletSigner,
        cfg.paymentMint
      );
      const instruction = await getEmergencyLpWithdrawInstructionAsync({
        owner: walletSigner,
        paymentMint: cfg.paymentMint,
        ownerTokenAccount: ata,
      });

      await send({
        action: "Emergency LP withdraw",
        instructions: [createAta, instruction],
        expectedStateChange:
          `All LP shares are burned and ${symbol} is returned to owner.`,
        touchedAccounts: [
          { label: "LP vault", address: lpVault.address! },
          { label: "owner ATA", address: ata },
        ],
      });
    });

  const handleInitializeReferral = () =>
    runAction("Initialize referral", async () => {
      const walletSigner = requireSigner();
      const SYSTEM_ID = parseAddress("11111111111111111111111111111111");
      const parentInput = tryParseAddress(referralParentInput);
      const parentReferrer = parentInput ?? SYSTEM_ID;
      const hasParent =
        parentReferrer !== SYSTEM_ID && parentReferrer !== walletSigner.address;
      const parentReferralPda = hasParent
        ? pdaAddress(await findReferralPda({ referrer: parentReferrer }))
        : undefined;

      const instruction = await getInitializeReferralInstructionAsync({
        referrer: walletSigner,
        parentReferrer,
        parentReferral: parentReferralPda,
      });
      await send({
        action: "Initialize referral",
        instructions: [instruction],
        expectedStateChange:
          "Referral PDA is created for the connected wallet.",
        touchedAccounts: [
          {
            label: "referral",
            address: referral.address ?? walletSigner.address,
          },
          ...(parentReferralPda
            ? [{ label: "parent referral", address: parentReferralPda }]
            : []),
        ],
      });
    });

  const handleClaimReferral = () =>
    runAction("Claim referral fees", async () => {
      const walletSigner = requireSigner();
      const cfg = requireConfig();
      if (!referral.referral || referral.referral.accrued === 0n) {
        throw new Error("No referral fees are accrued.");
      }
      const { ata, createAta } = await buildWalletAta(
        walletSigner,
        cfg.paymentMint
      );
      const instruction = await getClaimReferralFeesInstructionAsync({
        referrer: walletSigner,
        paymentMint: cfg.paymentMint,
        referrerTokenAccount: ata,
      });
      await send({
        action: "Claim referral fees",
        instructions: [createAta, instruction],
        expectedStateChange: "Accrued referral fees are paid and reset.",
        tokenAmount: formatTokenAmount(referral.referral.accrued, decimals),
        touchedAccounts: [
          { label: "referral", address: referral.address! },
          { label: "referrer ATA", address: ata },
        ],
      });
    });

  const handleSubscribe = () =>
    runAction("Create subscription", async () => {
      const walletSigner = requireSigner();
      const cfg = requireConfig();
      const dailyTicketCount = Number(subscriptionCountInput || "0");
      const days = Number(subscriptionDaysInput || "0");
      if (dailyTicketCount < 1 || dailyTicketCount > TICKET_BATCH_LIMIT) {
        throw new Error(`Daily ticket count must be 1-${TICKET_BATCH_LIMIT}.`);
      }
      if (days < 1)
        throw new Error("Subscription days must be greater than 0.");
      const escrowAmount =
        cfg.defaultTicketPrice * BigInt(dailyTicketCount) * BigInt(days);
      if (userPaymentAccount.amount < escrowAmount) {
        throw new Error(`Insufficient ${symbol} balance for subscription escrow.`);
      }
      const { ata, createAta } = await buildWalletAta(
        walletSigner,
        cfg.paymentMint
      );
      const { referrer, referrerAccount } =
        await validateOptionalReferrer(referrerInput);
      const instruction = await getSubscribeDailyInstructionAsync({
        owner: walletSigner,
        paymentMint: cfg.paymentMint,
        ownerTokenAccount: ata,
        referrerAccount,
        dailyTicketCount,
        days,
        referrer: referrer ?? null,
      });
      await send({
        action: "Create subscription",
        instructions: [createAta, instruction],
        expectedStateChange:
          "Subscription PDA and escrow are initialized or refreshed.",
        tokenAmount: formatTokenAmount(escrowAmount, decimals),
        touchedAccounts: [
          {
            label: "subscription",
            address: subscription.address ?? walletSigner.address,
          },
          { label: "owner ATA", address: ata },
        ],
      });
    });

  const handleCancelSubscription = () =>
    runAction("Cancel subscription", async () => {
      const walletSigner = requireSigner();
      const cfg = requireConfig();
      const { ata, createAta } = await buildWalletAta(
        walletSigner,
        cfg.paymentMint
      );
      const instruction = await getCancelSubscriptionInstructionAsync({
        owner: walletSigner,
        paymentMint: cfg.paymentMint,
        ownerTokenAccount: ata,
      });
      await send({
        action: "Cancel subscription",
        instructions: [createAta, instruction],
        expectedStateChange:
          "Subscription is cancelled and remaining escrow is returned.",
        touchedAccounts: [
          {
            label: "subscription",
            address: subscription.address ?? walletSigner.address,
          },
          { label: "owner ATA", address: ata },
        ],
      });
    });

  const handleProcessSubscription = () =>
    runAction("Process subscription", async () => {
      const walletSigner = requireSigner();
      const cfg = requireConfig();
      const activeRound = requireRound();
      if (activeRound.round.state !== RoundState.Open) {
        throw new Error("Subscriptions can only process into an open round.");
      }
      const owner = subscriptionOwnerInput.trim()
        ? asAddress(subscriptionOwnerInput)
        : walletSigner.address;
      const subEscrow = pdaAddress(
        await findSubEscrowPda({ owner, paymentMint: cfg.paymentMint })
      );
      const subscriptionAddress = pdaAddress(
        await findSubscriptionPda({ owner })
      );
      const subscriptionAccount = await fetchMaybeSubscription(
        client.rpc,
        subscriptionAddress,
        { commitment: "confirmed" }
      );
      if (!subscriptionAccount.exists || !subscriptionAccount.data.active) {
        throw new Error(
          "Active subscription PDA does not exist for that owner."
        );
      }
      const buyerEntryAddress = pdaAddress(
        await findBuyerEntryPda({
          roundId: activeRound.round.roundId,
          buyer: owner,
        })
      );
      const entry = await fetchMaybeBuyerEntry(client.rpc, buyerEntryAddress, {
        commitment: "confirmed",
      });
      const dailyTicketCount = subscriptionAccount.data.dailyTicketCount;
      const picks = Array.from({ length: dailyTicketCount }, () =>
        quickPick(
          activeRound.round.normalBallMax,
          activeRound.round.bonusballMax
        )
      );
      let referrerAccount: Address | undefined;
      let parentReferrerAccount: Address | undefined;
      if (subscriptionAccount.data.hasReferrer) {
        referrerAccount = pdaAddress(
          await findReferralPda({
            referrer: subscriptionAccount.data.referrer,
          })
        );
        const refAccount = await fetchMaybeReferral(
          client.rpc,
          referrerAccount,
          { commitment: "confirmed" }
        );
        if (refAccount.exists && refAccount.data.hasParent) {
          parentReferrerAccount = pdaAddress(
            await findReferralPda({
              referrer: refAccount.data.parentReferrer,
            })
          );
        }
      }
      const built = await buildProcessSubscriptionInstruction({
        keeper: walletSigner,
        owner,
        round: activeRound.address,
        roundId: activeRound.round.roundId,
        paymentMint: cfg.paymentMint,
        picks,
        firstTicketIndex: entry.exists ? entry.data.ticketCount : 0n,
        referrerAccount,
        parentReferrerAccount,
      });
      await send({
        action: "Process subscription",
        instructions: [built.instruction],
        expectedStateChange:
          "Escrow funds the generated ticket picks for this round.",
        touchedAccounts: [
          { label: "subscription", address: subscriptionAddress },
          { label: "sub escrow", address: subEscrow },
          { label: "buyer entry", address: built.buyerEntry },
          ...built.ticketPdas.map((address, index) => ({
            label: `subscription ticket ${index + 1}`,
            address,
          })),
        ],
      });
    });

  const handleInitializeConfig = () =>
    runAction("Initialize config", async () => {
      const walletSigner = requireSigner();
      const mint = setupMintAddress;
      if (!mint) throw new Error("Enter a valid payment mint address.");
      const params = formToConfigParams(
        effectiveConfigForm,
        setupMint.decimals
      );
      const instruction = await getInitializeConfigInstructionAsync({
        admin: walletSigner,
        paymentMint: mint,
        params,
      });
      await send({
        action: "Initialize config",
        instructions: [instruction],
        expectedStateChange:
          "Config, round counter, prize vault, and LP vault are initialized.",
        touchedAccounts: [{ label: "Payment mint", address: mint }],
      });
    });

  const handleUpdateConfig = () =>
    runAction("Update config", async () => {
      const walletSigner = requireSigner();
      if (!isAdmin) throw new Error("Only config.admin can update config.");
      const instruction = await getUpdateConfigInstructionAsync({
        admin: walletSigner,
        params: formToConfigParams(effectiveConfigForm, decimals),
      });
      await send({
        action: "Update config",
        instructions: [instruction],
        expectedStateChange:
          "Config parameters are replaced with the submitted values.",
        touchedAccounts: [{ label: "config", address: configState.address! }],
      });
    });

  const handleSetPaused = (paused: boolean) =>
    runAction(paused ? "Pause lottery" : "Resume lottery", async () => {
      const walletSigner = requireSigner();
      if (!isAdmin) throw new Error("Only config.admin can toggle pause.");
      const instruction = await getSetPausedInstructionAsync({
        admin: walletSigner,
        paused,
      });
      await send({
        action: paused ? "Pause lottery" : "Resume lottery",
        instructions: [instruction],
        expectedStateChange: `Config paused flag becomes ${paused}.`,
        touchedAccounts: [{ label: "config", address: configState.address! }],
      });
    });

  const handleSetEmergencyMode = (enabled: boolean) =>
    runAction(
      enabled ? "Enable emergency mode" : "Disable emergency mode",
      async () => {
        const walletSigner = requireSigner();
        if (!isAdmin)
          throw new Error("Only config.admin can toggle emergency mode.");
        const instruction = await getSetEmergencyModeInstructionAsync({
          admin: walletSigner,
          enabled,
        });
        await send({
          action: enabled ? "Enable emergency mode" : "Disable emergency mode",
          instructions: [instruction],
          expectedStateChange: `Config emergency mode becomes ${enabled}.`,
          touchedAccounts: [{ label: "config", address: configState.address! }],
        });
      }
    );

  const handleEnterRoundEmergency = () =>
    runAction("Enter round emergency", async () => {
      const walletSigner = requireSigner();
      const cfg = requireConfig();
      const activeRound = requireRound();
      if (!isAdmin)
        throw new Error("Only config.admin can enter round emergency.");
      // enter_round_emergency now atomically returns the LP guarantee from
      // prize_vault → lp_principal (M3 fix), so it requires the payment mint and
      // the prize/lp accounts. Codama auto-derives the optional PDAs from the
      // payment mint; we pass it explicitly.
      const instruction = await getEnterRoundEmergencyInstructionAsync({
        admin: walletSigner,
        round: activeRound.address,
        paymentMint: cfg.paymentMint,
      });
      await send({
        action: "Enter round emergency",
        instructions: [instruction],
        expectedStateChange: "Current round state becomes Emergency.",
        touchedAccounts: [{ label: "round", address: activeRound.address }],
      });
    });

  const handleArchiveRound = () =>
    runAction("Archive round", async () => {
      const walletSigner = requireSigner();
      const activeRound = requireRound();
      const cfg = requireConfig();
      if (!isAdmin) throw new Error("Only config.admin can archive rounds.");
      const instruction = await getArchiveRoundInstructionAsync({
        admin: walletSigner,
        round: activeRound.address,
        paymentMint: cfg.paymentMint,
      });
      await send({
        action: "Archive round",
        instructions: [instruction],
        expectedStateChange: "Current round state becomes Archived.",
        touchedAccounts: [{ label: "round", address: activeRound.address }],
      });
    });

  const handleStartRound = () =>
    runAction("Start round", async () => {
      const walletSigner = requireSigner();
      const cfg = requireConfig();
      const currentId = currentRound.counter.counter?.currentRoundId ?? 0n;
      const nextRoundId = currentId + 1n;
      const nextRound = pdaAddress(await findRoundPda(nextRoundId));
      const previousRound =
        currentId > 0n
          ? pdaAddress(await findRoundPda(currentId))
          : LOTTERY_PROGRAM_ID;
      const ticketPrice = parseTokenAmount(
        startTicketPriceInput ||
          formatTokenAmount(cfg.defaultTicketPrice, decimals),
        decimals
      );
      const durationSeconds = BigInt(
        startDurationInput || cfg.defaultRoundDurationSecs
      );
      const bonusballMax = Number(startBonusMaxInput || cfg.bonusballMax);
      const guaranteedPrizePoolOverride = parseTokenAmount(
        startGuaranteedPoolInput ||
          formatTokenAmount(cfg.guaranteedPrizePool, decimals),
        decimals
      );
      const instruction = await getStartRoundInstructionAsync({
        starter: walletSigner,
        previousRound,
        round: nextRound,
        paymentMint: cfg.paymentMint,
        ticketPrice,
        durationSeconds,
        bonusballMax,
        guaranteedPrizePoolOverride,
      });
      await send({
        action: "Start round",
        instructions: [instruction],
        expectedStateChange: `Round ${nextRoundId.toString()} opens.`,
        touchedAccounts: [
          { label: "previous round", address: previousRound },
          { label: "new round", address: nextRound },
        ],
      });
    });

  const handlePrepareRandomness = () =>
    runAction("Prepare randomness", async () => {
      const walletSigner = requireSigner();
      const activeRound = requireRound();
      if (cluster !== "devnet") {
        throw new Error(
          "Switchboard randomness setup is enabled only on devnet in V1."
        );
      }
      const built = await buildCreateRandomnessInstruction({
        cluster,
        payer: walletSigner.address,
      });
      await send({
        action: "Prepare randomness",
        instructions: [built.instruction],
        expectedStateChange:
          "Switchboard randomness account is created for the round.",
        touchedAccounts: [
          { label: "round", address: activeRound.address },
          { label: "randomness", address: built.randomnessAccount },
        ],
      });
      const key = getRandomnessStorageKey(cluster, activeRound.round.roundId);
      if (key) window.localStorage.setItem(key, built.randomnessAccount);
      setRandomnessInput(built.randomnessAccount);
    });

  const handleCommitDraw = () =>
    runAction("Commit draw", async () => {
      const walletSigner = requireSigner();
      const activeRound = requireRound();
      if (!canCommit) {
        throw new Error(
          "Commit is enabled only for devnet rounds ready to draw."
        );
      }
      const randomnessAccount = asAddress(randomnessInput);
      const switchboardIx = await buildSwitchboardCommitInstruction({
        cluster,
        randomnessAccount,
      });
      const lotteryIx = await getCommitDrawInstructionAsync({
        trigger: walletSigner,
        round: activeRound.address,
        randomnessAccount,
      });
      await send({
        action: "Commit draw",
        instructions: [switchboardIx, lotteryIx],
        expectedStateChange:
          "Switchboard commit lands and round stores the randomness account.",
        touchedAccounts: [
          { label: "round", address: activeRound.address },
          { label: "randomness", address: randomnessAccount },
        ],
      });
    });

  const handleRevealDraw = () =>
    runAction("Reveal draw", async () => {
      const walletSigner = requireSigner();
      const activeRound = requireRound();
      if (!canReveal) {
        throw new Error(
          "Reveal is enabled only for committed devnet drawing rounds."
        );
      }
      const randomnessAccount = asAddress(randomnessInput);
      if (activeRound.round.randomnessAccount !== randomnessAccount) {
        throw new Error("Randomness account does not match the round account.");
      }
      const switchboardIx = await buildSwitchboardRevealInstruction({
        cluster,
        randomnessAccount,
        payer: walletSigner.address,
      });
      const lotteryIx = await getRevealDrawInstructionAsync({
        trigger: walletSigner,
        round: activeRound.address,
        randomnessAccount,
      });
      await send({
        action: "Reveal draw",
        instructions: [switchboardIx, lotteryIx],
        expectedStateChange:
          "Winning balls are recorded and round enters Claimable state.",
        touchedAccounts: [
          { label: "round", address: activeRound.address },
          { label: "randomness", address: randomnessAccount },
        ],
      });
    });

  // Tally was removed — reveal_draw now precomputes payouts and the round
  // transitions straight to Claimable. Winners just call claim_winnings.

  const ticketRows = tickets.tickets.flatMap((account, index) => {
    const ticketAddress = tickets.addresses[index];
    return account.exists && ticketAddress
      ? [{ address: ticketAddress, data: account.data }]
      : [];
  });

  // DEBUG: Log ticket rows
  useEffect(() => {
    console.log("🎟️ Ticket Rows:", {
      totalTickets: tickets.tickets?.length,
      totalAddresses: tickets.addresses?.length,
      ticketRowsLength: ticketRows.length,
      existingTickets: tickets.tickets?.filter((t) => t.exists).length,
      ticketRows: ticketRows.map((t) => ({
        address: t.address,
        normals: Array.from(t.data.normals),
        bonusball: t.data.bonusball,
        claimed: t.data.claimed,
      })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketRows.length, tickets.tickets?.length]);

  const winningTicketCount = round
    ? ticketRows.filter((ticket) => isWinningTicket(round, ticket.data).winning)
        .length
    : 0;

  const overviewMetrics = [
    {
      label: "Prize pool",
      value: formatTokenAmount(round?.prizePool, decimals),
      subvalue: symbol,
    },
    {
      label: "Seed pool",
      value: formatTokenAmount(round?.seedPrizePool, decimals),
      subvalue: symbol,
    },
    {
      label: "LP guarantee",
      value: formatTokenAmount(round?.lpGuaranteeReserved, decimals),
      subvalue: "reserved",
    },
    {
      label: "Rolled to next",
      value: formatTokenAmount(round?.rolledToNextRound, decimals),
      subvalue: "post-archive",
    },
    {
      label: "Tickets",
      value: round?.ticketCount.toString() ?? "0",
      subvalue: `${winningTicketCount} winners`,
    },
  ];

  const explorerRows: { label: string; address?: Address }[] = [
    { label: "Lottery program", address: LOTTERY_PROGRAM_ID },
    { label: "Config", address: configState.address },
    { label: "Round counter", address: currentRound.counter.address },
    { label: "Current round", address: roundAddress },
    { label: "Payment mint", address: config?.paymentMint },
    { label: "Prize vault", address: programTokens.data?.prizeVault },
    { label: "LP vault", address: lpVault.address },
    { label: "LP principal", address: programTokens.data?.lpPrincipal },
    { label: "LP position", address: lpPosition.address },
    { label: "Referral", address: referral.address },
    { label: "Subscription", address: subscription.address },
    { label: "Sub escrow", address: programTokens.data?.subEscrow },
    { label: "Buyer entry", address: buyerEntry.address },
    { label: `User ${symbol} ATA`, address: userPaymentAccount.ata },
    {
      label: "Switchboard randomness",
      address: tryParseAddress(randomnessInput),
    },
  ];

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <GridBackground />
      <div className="relative z-10">
        <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-sm font-semibold tracking-tight">
              Megapot Lottery
            </p>
            <p className="text-xs text-muted">Operations console</p>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <ClusterSelect />

            <WalletButton />
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-6 pb-16">
          <section className="flex flex-col gap-6 py-6 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-4xl font-black tracking-tight md:text-6xl">
                Megapot Lottery
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge tone={config ? "good" : "warn"}>
                  {config ? "Config initialized" : "Setup required"}
                </StatusBadge>
                <StatusBadge
                  tone={
                    config?.emergencyMode
                      ? "bad"
                      : config?.paused
                        ? "warn"
                        : "neutral"
                  }
                >
                  {config?.emergencyMode
                    ? "Emergency"
                    : config?.paused
                      ? "Paused"
                      : "Writes guarded"}
                </StatusBadge>
                {isMainnet && (
                  <StatusBadge tone="bad">Mainnet writes disabled</StatusBadge>
                )}
                {isAdmin && <StatusBadge tone="good">Admin wallet</StatusBadge>}
              </div>
            </div>
            <div className="grid gap-2 text-sm md:text-right">
              <span className="text-muted">
                {selectedRoundId ? "Viewing round" : "Current round"}
              </span>
              <div className="flex items-center justify-end gap-3">
                <span className="text-2xl font-semibold tabular-nums">
                  {round?.roundId.toString() ?? "-"} / {stateName(roundState)}
                </span>
                <RoundSelect
                  selected={selectedRoundId}
                  onSelect={(id) => setSelectedRoundId(id)}
                />
              </div>
              <span className="text-xs text-muted">
                Draw{" "}
                {drawRemaining == null ? "-" : formatDuration(drawRemaining)}
              </span>
            </div>
          </section>

          <div className="mb-5 flex gap-2 overflow-x-auto border-b border-border-low pb-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`h-9 shrink-0 cursor-pointer rounded-lg px-3 text-xs font-semibold transition ${
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "border border-border-low bg-card hover:bg-cream"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="space-y-5">
            {activeTab === "overview" && (
              <>
                <Panel
                  title={selectedRoundId ? "Viewed Round" : "Current Round"}
                >
                  <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
                    {overviewMetrics.map((metric) => (
                      <Metric
                        key={metric.label}
                        label={metric.label}
                        value={metric.value}
                        subvalue={metric.subvalue}
                      />
                    ))}
                  </div>
                  {isAdmin && (
                    <div className="mt-3 rounded-lg border border-border-low bg-background/60 p-3 text-xs text-muted">
                      <div className="mb-2 font-semibold">
                        Debug — round accounting (raw)
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        <div>
                          ticketPrice:{" "}
                          <span className="font-mono">
                            {round?.ticketPrice?.toString() ?? "-"}
                          </span>
                        </div>
                        <div>
                          ticketCount:{" "}
                          <span className="font-mono">
                            {round?.ticketCount?.toString() ?? "-"}
                          </span>
                        </div>
                        <div>
                          seedPrizePool:{" "}
                          <span className="font-mono">
                            {round?.seedPrizePool?.toString() ?? "-"}
                          </span>
                        </div>
                        <div>
                          lpGuaranteeReserved:{" "}
                          <span className="font-mono">
                            {round?.lpGuaranteeReserved?.toString() ?? "-"}
                          </span>
                        </div>
                        <div>
                          prizePool:{" "}
                          <span className="font-mono">
                            {round?.prizePool?.toString() ?? "-"}
                          </span>
                        </div>
                        <div>
                          decimals:{" "}
                          <span className="font-mono">{decimals}</span>
                        </div>
                        <div>
                          computed ticketRevenue:{" "}
                          <span className="font-mono">
                            {round
                              ? (
                                  round.ticketPrice * round.ticketCount
                                ).toString()
                              : "-"}
                          </span>
                        </div>
                        <div>
                          prize pool:{" "}
                          <span className="font-mono">
                            {round ? round.prizePool.toString() : "-"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="mt-4 grid gap-3 md:grid-cols-5">
                    {[
                      RoundState.Open,
                      RoundState.Drawing,
                      RoundState.Claimable,
                      RoundState.Archived,
                    ].map((state) => (
                      <div
                        key={state}
                        className={`rounded-lg border px-3 py-3 text-sm ${
                          roundState === state
                            ? "border-foreground bg-foreground text-background"
                            : "border-border-low bg-background/60 text-muted"
                        }`}
                      >
                        {RoundState[state]}
                      </div>
                    ))}
                  </div>
                </Panel>

                <div className="grid gap-5 lg:grid-cols-2">
                  <Panel title="Vaults And Liquidity">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Metric
                        label="Prize vault balance"
                        value={formatTokenAmount(
                          prizeVaultBalance.amount,
                          decimals
                        )}
                        subvalue={
                          <AddressLink
                            address={programTokens.data?.prizeVault}
                          />
                        }
                      />
                      <Metric
                        label="LP principal balance"
                        value={formatTokenAmount(
                          lpPrincipalBalance.amount,
                          decimals
                        )}
                        subvalue={
                          <AddressLink
                            address={programTokens.data?.lpPrincipal}
                          />
                        }
                      />
                      <Metric
                        label="LP total assets"
                        value={formatTokenAmount(
                          lpVault.lpVault?.totalAssets,
                          decimals
                        )}
                        subvalue="program accounting"
                      />
                      <Metric
                        label="LP shares"
                        value={lpVault.lpVault?.totalShares.toString() ?? "0"}
                        subvalue={`${lpVault.lpVault?.pendingWithdrawShares ?? 0n} pending`}
                      />
                    </div>
                  </Panel>

                  <Panel title="Draw Result">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Metric
                        label="Winning normals"
                        value={
                          round ? ballsToString(round.winningNormals) : "-"
                        }
                      />
                      <Metric
                        label="Bonusball"
                        value={
                          round?.winningBonusball
                            ? round.winningBonusball.toString()
                            : "-"
                        }
                      />
                      <Metric
                        label="Claimed"
                        value={`${round?.claimedCount ?? 0n} / ${round?.ticketCount ?? 0n}`}
                      />
                      <Metric
                        label="Mins applied"
                        value={round?.usedMinimumPayouts ? "Yes" : "No"}
                      />
                    </div>
                  </Panel>
                </div>

                <Panel title="Tier Payouts">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead className="text-xs text-muted">
                        <tr>
                          <th className="py-2">Tier</th>
                          <th>Winning?</th>
                          <th>Payout / combo</th>
                          <th>Paid count</th>
                          <th>Paid amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: 12 }, (_, tier) => (
                          <tr key={tier} className="border-t border-border-low">
                            <td className="py-2 font-mono">{tier}</td>
                            <td>{round?.tierIsWinning[tier] ? "yes" : "no"}</td>
                            <td>
                              {formatTokenAmount(
                                round?.perComboPayout[tier],
                                decimals
                              )}
                            </td>
                            <td>{round?.tierPaidCounts[tier] ?? 0}</td>
                            <td>
                              {formatTokenAmount(
                                round?.tierPaidAmounts[tier],
                                decimals
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              </>
            )}

            {activeTab === "player" && (
              <div className="space-y-5">
                <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
                  <Panel title="Ticket Picker">
                    <div className="space-y-3">
                      <Field
                        label="Normal balls"
                        value={normalInput}
                        onChange={setNormalInput}
                      />
                      <Field
                        label="Bonusball"
                        value={bonusInput}
                        onChange={setBonusInput}
                      />
                      <Field
                        label="Batch count"
                        value={batchCountInput}
                        onChange={setBatchCountInput}
                        type="number"
                      />
                      <Field
                        label="Optional referrer"
                        value={referrerInput}
                        onChange={setReferrerInput}
                        placeholder="Referral owner address"
                      />
                      <ActionButton
                        onClick={handleGenerateReferralLink}
                        disabled={!walletAddress || isSending}
                      >
                        Generate referral link
                      </ActionButton>
                      <div className="flex flex-wrap gap-2">
                        <ActionButton onClick={handleQuickPick}>
                          Quick pick
                        </ActionButton>
                        <ActionButton
                          variant="primary"
                          onClick={handleBuyTickets}
                          disabled={
                            !canBuy || isSending || busyAction === "Buy tickets"
                          }
                        >
                          Buy tickets
                        </ActionButton>
                      </div>
                      <div className="grid gap-2 rounded-lg border border-border-low bg-background/60 p-3 text-xs text-muted">
                        <div className="flex justify-between gap-3">
                          <span>User {symbol}</span>
                          <span className="font-mono">
                            {formatTokenAmount(userPaymentAccount.amount, decimals)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span>Ticket price</span>
                          <span className="font-mono">
                            {formatTokenAmount(round?.ticketPrice, decimals)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span>Buyer entry</span>
                          <AddressLink address={buyerEntry.address} />
                        </div>
                        <div className="flex justify-between gap-3">
                          <span>Buyer entry exists</span>
                          <span className="font-mono">
                            {buyerEntry.exists ? "Yes" : "No"}
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span>Ticket count</span>
                          <span className="font-mono">
                            {buyerEntry.buyerEntry?.ticketCount.toString() ??
                              "0"}
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span>Tickets loaded</span>
                          <span className="font-mono">
                            {tickets.tickets.length} / {ticketRows.length}{" "}
                            displayed
                          </span>
                        </div>
                      </div>
                    </div>
                  </Panel>

                  <Panel title="My Tickets">
                    <div className="space-y-3">
                      {roundId && (
                        <div className="rounded-lg border border-border-low bg-background/60 p-2 text-xs text-muted">
                          <div className="flex items-center justify-between">
                            <span>
                              Showing tickets for Round #{roundId.toString()}
                              {selectedRoundId &&
                                selectedRoundId !==
                                  currentRound.round?.roundId?.toString() && (
                                  <span className="ml-2 text-amber-600 dark:text-amber-400">
                                    (Historical)
                                  </span>
                                )}
                            </span>
                            {buyerEntry.exists && (
                              <span className="font-mono">
                                {buyerEntry.buyerEntry?.ticketCount.toString() ??
                                  "0"}{" "}
                                ticket(s) purchased
                              </span>
                            )}
                          </div>
                          {!buyerEntry.exists && !buyerEntry.isLoading && (
                            <div className="mt-1 text-amber-600 dark:text-amber-400">
                              No tickets purchased for this round.
                              {selectedRoundId &&
                                currentRound.round?.roundId && (
                                  <button
                                    onClick={() =>
                                      setSelectedRoundId(undefined)
                                    }
                                    className="ml-2 underline hover:text-amber-700 dark:hover:text-amber-300"
                                  >
                                    View current round (#
                                    {currentRound.round.roundId.toString()})
                                  </button>
                                )}
                            </div>
                          )}
                          {buyerEntry.isLoading && (
                            <div className="mt-1 text-blue-600 dark:text-blue-400">
                              Loading buyer entry data...
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted">Filter:</span>
                        <ActionButton
                          variant={
                            ticketFilter === "all" ? "primary" : undefined
                          }
                          onClick={() => setTicketFilter("all")}
                        >
                          All ({ticketRows.length})
                        </ActionButton>
                        <ActionButton
                          variant={
                            ticketFilter === "winning" ? "primary" : undefined
                          }
                          onClick={() => setTicketFilter("winning")}
                        >
                          Winners (
                          {
                            ticketRows.filter(
                              (t) =>
                                round && isWinningTicket(round, t.data).winning
                            ).length
                          }
                          )
                        </ActionButton>
                        <ActionButton
                          variant={
                            ticketFilter === "losing" ? "primary" : undefined
                          }
                          onClick={() => setTicketFilter("losing")}
                        >
                          Non-winners (
                          {
                            ticketRows.filter(
                              (t) =>
                                round && !isWinningTicket(round, t.data).winning
                            ).length
                          }
                          )
                        </ActionButton>
                        <div className="ml-auto">
                          <ActionButton
                            onClick={() => {
                              tickets.mutate();
                              buyerEntry.mutate();
                              toast.info("Refreshing ticket data...");
                            }}
                            disabled={!roundId || !walletAddress}
                          >
                            🔄 Refresh
                          </ActionButton>
                        </div>
                      </div>
                      {ticketRows.length === 0 && buyerEntry.exists && (
                        <div className="rounded-lg border border-border-low bg-blue-50 dark:bg-blue-950/20 p-3">
                          <p className="text-sm text-blue-700 dark:text-blue-300">
                            Loading tickets... (
                            {buyerEntry.buyerEntry?.ticketCount.toString() ??
                              "0"}{" "}
                            expected)
                          </p>
                          <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                            If tickets don't appear after a few seconds, try
                            refreshing the page. Large batches may take longer
                            to index.
                          </p>
                        </div>
                      )}
                      {ticketRows.length === 0 &&
                        !buyerEntry.exists &&
                        (buyerEntry.isLoading || buyerEntry.isValidating) && (
                          <p className="text-sm text-muted">
                            Loading buyer entry data...
                          </p>
                        )}
                      {ticketRows.length === 0 &&
                        !buyerEntry.exists &&
                        !buyerEntry.isLoading &&
                        !buyerEntry.isValidating && (
                          <div className="rounded-lg border border-border-low bg-background/60 p-3">
                            <p className="text-sm text-muted">
                              No tickets found for this round.
                            </p>
                            {selectedRoundId && currentRound.round?.roundId && (
                              <button
                                onClick={() => setSelectedRoundId(undefined)}
                                className="mt-2 text-xs text-primary underline hover:text-primary/80"
                              >
                                Switch to current round (#
                                {currentRound.round.roundId.toString()})
                              </button>
                            )}
                          </div>
                        )}
                      {ticketRows
                        .filter((ticket) => {
                          if (ticketFilter === "all") return true;
                          if (!round) return false;
                          const outcome = isWinningTicket(round, ticket.data);
                          return ticketFilter === "winning"
                            ? outcome.winning
                            : !outcome.winning;
                        })
                        .map((ticket) => {
                          const outcome = round
                            ? isWinningTicket(round, ticket.data)
                            : {
                                matches: 0,
                                hasBonusball: false,
                                tier: 0,
                                winning: false,
                              };
                          const matchedNormals = round
                            ? ticket.data.normals.filter((value) =>
                                Array.from(round.winningNormals).includes(value)
                              )
                            : [];

                          return (
                            <div
                              key={ticket.address}
                              className="grid gap-3 rounded-lg border border-border-low bg-background/60 p-3 md:grid-cols-[1fr_auto]"
                            >
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono text-sm">
                                    #{ticket.data.ticketIndex.toString()}
                                  </span>
                                  <StatusBadge
                                    tone={
                                      ticket.data.claimed
                                        ? "good"
                                        : outcome.winning
                                          ? "good"
                                          : "neutral"
                                    }
                                  >
                                    {ticket.data.claimed
                                      ? "Claimed"
                                      : outcome.winning
                                        ? `Tier ${outcome.tier} — winner 💰`
                                        : `Tier ${outcome.tier}`}
                                  </StatusBadge>
                                </div>
                                <p className="mt-2 text-sm">
                                  {ballsToString(ticket.data.normals)} +{" "}
                                  {ticket.data.bonusball}
                                </p>
                                <p className="mt-1 text-xs text-muted">
                                  Matching normals:{" "}
                                  {round ? ballsToString(matchedNormals) : "-"}
                                  {" · "}
                                  Bonusball:{" "}
                                  {round
                                    ? outcome.hasBonusball
                                      ? "match"
                                      : "no match"
                                    : "-"}
                                  {" · "}
                                  Matches: {round ? outcome.matches : "-"}
                                </p>
                                <p className="mt-1 text-xs text-muted">
                                  Paid{" "}
                                  {formatTokenAmount(
                                    ticket.data.pricePaid,
                                    decimals
                                  )}{" "}
                                  {symbol}, payout estimate{" "}
                                  {formatTokenAmount(
                                    ticketPayoutEstimate(round, ticket.data),
                                    decimals
                                  )}
                                </p>
                                <p className="mt-1">
                                  <AddressLink address={ticket.address} />
                                </p>
                              </div>
                              <div className="flex flex-wrap items-start gap-2 md:justify-end">
                                <ActionButton
                                  onClick={() => handleClaimTicket(ticket)}
                                  disabled={
                                    !round ||
                                    (round.state !== RoundState.Claimable &&
                                      round.state !== RoundState.Archived) ||
                                    ticket.data.claimed ||
                                    !outcome.winning ||
                                    ticketPayoutEstimate(round, ticket.data) ===
                                      0n ||
                                    isSending
                                  }
                                >
                                  Claim
                                </ActionButton>
                                <ActionButton
                                  variant="danger"
                                  onClick={() => handleEmergencyRefund(ticket)}
                                  disabled={
                                    !config?.emergencyMode &&
                                    round?.state !== RoundState.Emergency
                                  }
                                >
                                  Refund
                                </ActionButton>
                              </div>
                            </div>
                          );
                        })}
                      {ticketRows.length > 0 &&
                        ticketRows.filter((ticket) => {
                          if (ticketFilter === "all") return true;
                          if (!round) return false;
                          const outcome = isWinningTicket(round, ticket.data);
                          return ticketFilter === "winning"
                            ? outcome.winning
                            : !outcome.winning;
                        }).length === 0 && (
                          <p className="text-sm text-muted">
                            No{" "}
                            {ticketFilter === "winning"
                              ? "winning"
                              : "non-winning"}{" "}
                            tickets found.
                          </p>
                        )}
                      {tickets.isTruncated && (
                        <p className="text-xs text-muted">
                          Ticket list is capped at 500 derived PDAs in the
                          browser.
                        </p>
                      )}
                    </div>
                  </Panel>
                </div>
              </div>
            )}

            {activeTab === "lp" && (
              <div className="grid gap-5 lg:grid-cols-2">
                <Panel title="LP Overview">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Metric
                      label="Total assets"
                      value={formatTokenAmount(
                        lpVault.lpVault?.totalAssets,
                        decimals
                      )}
                      subvalue={symbol}
                    />
                    <Metric
                      label="Total shares"
                      value={lpVault.lpVault?.totalShares.toString() ?? "0"}
                    />
                    <Metric
                      label="Your shares"
                      value={lpPosition.position?.shares.toString() ?? "0"}
                    />
                    <Metric
                      label="Pending shares"
                      value={
                        lpPosition.position?.pendingWithdrawShares.toString() ??
                        "0"
                      }
                      subvalue={`round ${lpPosition.position?.pendingWithdrawRound ?? 0n}`}
                    />
                    <Metric
                      label="Lifetime edge earned"
                      value={formatTokenAmount(
                        lpVault.lpVault?.lifetimeEdgeEarned,
                        decimals
                      )}
                      subvalue={symbol}
                    />
                    <Metric
                      label="Lifetime jackpot loss"
                      value={formatTokenAmount(
                        lpVault.lpVault?.lifetimeJackpotLoss,
                        decimals
                      )}
                      subvalue={symbol}
                    />
                  </div>
                  <p className="mt-4 text-sm text-muted">
                    Withdrawals finalize after the pending round recorded in the
                    LP position.
                  </p>
                </Panel>
                <Panel title="LP Actions">
                  <div className="grid gap-2 rounded-lg border border-border-low bg-background/60 p-3 text-xs text-muted mb-3">
                    <div className="flex justify-between gap-3">
                      <span>User {symbol}</span>
                      <span className="font-mono">
                        {formatTokenAmount(userPaymentAccount.amount, decimals)}
                      </span>
                    </div>
                  </div>
                  <div className="grid gap-3">
                    <Field
                      label={`Deposit ${symbol}`}
                      value={lpDepositInput}
                      onChange={setLpDepositInput}
                    />
                    <div>
                      <ActionButton
                        variant="primary"
                        onClick={handleLpDeposit}
                        disabled={!config || isMainnet || isSending}
                      >
                        Deposit
                      </ActionButton>
                    </div>
                    <Field
                      label={`Withdraw amount (${symbol})`}
                      value={lpWithdrawInput}
                      onChange={setLpWithdrawInput}
                      placeholder="e.g. 100"
                    />
                    <div className="flex flex-wrap gap-2">
                      <ActionButton
                        onClick={handleLpInitiateWithdraw}
                        disabled={!config || isMainnet || isSending}
                      >
                        Initiate withdraw
                      </ActionButton>
                      <ActionButton
                        onClick={handleLpFinalizeWithdraw}
                        disabled={
                          !config ||
                          isMainnet ||
                          !lpPosition.position?.pendingWithdrawShares ||
                          isSending
                        }
                      >
                        Finalize withdraw
                      </ActionButton>
                      <ActionButton
                        variant="danger"
                        onClick={handleEmergencyLpWithdraw}
                        disabled={
                          !config?.emergencyMode || isMainnet || isSending
                        }
                      >
                        Emergency withdraw
                      </ActionButton>
                    </div>
                  </div>
                </Panel>
              </div>
            )}

            {activeTab === "referral" && (
              <Panel title="Referral">
                <div className="grid gap-3">
                  <Field
                    label="Parent referrer address (optional)"
                    value={referralParentInput}
                    onChange={setReferralParentInput}
                    placeholder="Leave blank for no parent"
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <Metric
                    label="Referral PDA"
                    value={<AddressLink address={referral.address} />}
                    subvalue={referral.exists ? "initialized" : "missing"}
                  />
                  <Metric
                    label="Accrued"
                    value={formatTokenAmount(
                      referral.referral?.accrued,
                      decimals
                    )}
                    subvalue={symbol}
                  />
                  <Metric
                    label="Lifetime earned (1st)"
                    value={formatTokenAmount(
                      referral.referral?.lifetimeEarnedFirst,
                      decimals
                    )}
                    subvalue={`${symbol} direct`}
                  />
                  <Metric
                    label="Lifetime earned (2nd)"
                    value={formatTokenAmount(
                      referral.referral?.lifetimeEarnedSecond,
                      decimals
                    )}
                    subvalue={`${symbol} upstream`}
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <ActionButton
                    variant="primary"
                    onClick={handleInitializeReferral}
                    disabled={
                      !walletAddress ||
                      referral.exists ||
                      isMainnet ||
                      isSending
                    }
                  >
                    Initialize referral
                  </ActionButton>
                  <ActionButton
                    onClick={handleClaimReferral}
                    disabled={
                      !referral.referral ||
                      referral.referral.accrued === 0n ||
                      isMainnet ||
                      isSending
                    }
                  >
                    Claim fees
                  </ActionButton>
                </div>
              </Panel>
            )}

            {activeTab === "subscription" && (
              <div className="grid gap-5 lg:grid-cols-2">
                <Panel title="Create Subscription">
                  <div className="grid gap-3">
                    <Field
                      label="Daily ticket count"
                      value={subscriptionCountInput}
                      onChange={setSubscriptionCountInput}
                      type="number"
                    />
                    <Field
                      label="Days"
                      value={subscriptionDaysInput}
                      onChange={setSubscriptionDaysInput}
                      type="number"
                    />
                    <Field
                      label="Optional referrer"
                      value={referrerInput}
                      onChange={setReferrerInput}
                    />
                    <p className="text-xs text-muted">
                      Estimated escrow{" "}
                      {formatTokenAmount(
                        (config?.defaultTicketPrice ?? 0n) *
                          BigInt(
                            Math.max(0, Number(subscriptionCountInput || "0"))
                          ) *
                          BigInt(
                            Math.max(0, Number(subscriptionDaysInput || "0"))
                          ),
                        decimals
                      )}{" "}
                      {symbol}
                    </p>
                    <div>
                      <ActionButton
                        variant="primary"
                        onClick={handleSubscribe}
                        disabled={!config || isMainnet || isSending}
                      >
                        Create subscription
                      </ActionButton>
                    </div>
                  </div>
                </Panel>

                <Panel title="Active Subscription">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Metric
                      label="Status"
                      value={
                        subscription.subscription?.active
                          ? "Active"
                          : "Inactive"
                      }
                    />
                    <Metric
                      label="Escrow balance"
                      value={formatTokenAmount(
                        subscription.subscription?.escrowBalance ??
                          subEscrowBalance.amount,
                        decimals
                      )}
                    />
                    <Metric
                      label="Agreed price"
                      value={formatTokenAmount(
                        subscription.subscription?.agreedPrice,
                        decimals
                      )}
                    />
                    <Metric
                      label="Remaining days"
                      value={
                        subscription.subscription?.remainingDays.toString() ??
                        "0"
                      }
                    />
                    <Metric
                      label="Expiry"
                      value={formatDate(subscription.subscription?.expiresAt)}
                    />
                    <Metric
                      label="Last processed"
                      value={
                        subscription.subscription?.lastProcessedRound.toString() ??
                        "0"
                      }
                    />
                  </div>
                  <div className="mt-4 grid gap-3">
                    <Field
                      label="Process owner"
                      value={subscriptionOwnerInput}
                      onChange={setSubscriptionOwnerInput}
                      placeholder="blank for connected wallet"
                    />
                    <div className="flex flex-wrap gap-2">
                      <ActionButton
                        onClick={handleProcessSubscription}
                        disabled={!config || !round || isMainnet || isSending}
                      >
                        Process subscription
                      </ActionButton>
                      <ActionButton
                        variant="danger"
                        onClick={handleCancelSubscription}
                        disabled={
                          !subscription.exists || isMainnet || isSending
                        }
                      >
                        Cancel
                      </ActionButton>
                    </div>
                  </div>
                </Panel>
              </div>
            )}

            {activeTab === "admin" && (
              <div className="space-y-5">
                {!config && (
                  <Panel title="Setup">
                    <div className="grid gap-3">
                      <Field
                        label="Payment mint"
                        value={setupMintInput}
                        onChange={setSetupMintInput}
                        placeholder="SPL Token mint address (USDC, USDT, PYUSD, …)"
                      />
                      <DecimalsHeadsUp
                        decimals={setupMint.decimals}
                        detected={!!setupMint.mint}
                      />
                      <ConfigFormFields symbol={symbol}
                        form={effectiveConfigForm}
                        onChange={handleConfigFormChange}
                      />
                      <div>
                        <ActionButton
                          variant="primary"
                          onClick={handleInitializeConfig}
                          disabled={!walletAddress || isMainnet || isSending}
                        >
                          Initialize config
                        </ActionButton>
                      </div>
                    </div>
                  </Panel>
                )}

                {config && (
                  <Panel
                    title="Config Editor"
                    action={
                      <StatusBadge tone={isAdmin ? "good" : "warn"}>
                        {isAdmin ? "Admin" : "Read-only"}
                      </StatusBadge>
                    }
                  >
                    <DecimalsHeadsUp decimals={decimals} detected />
                    <ConfigFormFields symbol={symbol}
                      form={effectiveConfigForm}
                      onChange={handleConfigFormChange}
                    />
                    <div className="mt-4 flex flex-wrap gap-2">
                      <ActionButton
                        variant="primary"
                        onClick={handleUpdateConfig}
                        disabled={!isAdmin || isMainnet || isSending}
                      >
                        Update config
                      </ActionButton>
                      <ActionButton
                        onClick={() => handleSetPaused(!config.paused)}
                        disabled={!isAdmin || isMainnet || isSending}
                      >
                        {config.paused ? "Resume" : "Pause"}
                      </ActionButton>
                      <ActionButton
                        variant={config.emergencyMode ? "secondary" : "danger"}
                        onClick={() =>
                          handleSetEmergencyMode(!config.emergencyMode)
                        }
                        disabled={!isAdmin || isMainnet || isSending}
                      >
                        {config.emergencyMode
                          ? "Disable emergency"
                          : "Enable emergency"}
                      </ActionButton>
                      <ActionButton
                        variant="danger"
                        onClick={handleEnterRoundEmergency}
                        disabled={!isAdmin || !round || isMainnet || isSending}
                      >
                        Enter round emergency
                      </ActionButton>
                      <ActionButton
                        onClick={handleArchiveRound}
                        disabled={!isAdmin || !round || isMainnet || isSending}
                      >
                        Archive round
                      </ActionButton>
                    </div>
                  </Panel>
                )}
              </div>
            )}

            {activeTab === "operations" && (
              <div className="space-y-5">
                <Panel title="Round Lifecycle">
                  <div className="grid gap-3 md:grid-cols-3">
                    <Field
                      label="Ticket price"
                      value={startTicketPriceInput}
                      onChange={setStartTicketPriceInput}
                    />
                    <Field
                      label="Duration seconds"
                      value={startDurationInput}
                      onChange={setStartDurationInput}
                    />
                    <Field
                      label="Bonusball max"
                      value={startBonusMaxInput}
                      onChange={setStartBonusMaxInput}
                    />
                    <Field
                      label={`Guaranteed prize pool override (${symbol})`}
                      value={startGuaranteedPoolInput}
                      onChange={setStartGuaranteedPoolInput}
                      placeholder={formatTokenAmount(
                        config?.guaranteedPrizePool ?? 0n,
                        decimals
                      )}
                    />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <ActionButton
                      variant="primary"
                      onClick={handleStartRound}
                      disabled={!config || isMainnet || isSending}
                    >
                      Start round
                    </ActionButton>
                  </div>
                </Panel>

                <Panel title="Switchboard Randomness">
                  <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                    <Field
                      label="Randomness account"
                      value={randomnessInput}
                      onChange={setRandomnessInput}
                      placeholder="Switchboard randomness account"
                    />
                    <div className="flex items-end gap-2">
                      <ActionButton
                        onClick={handlePrepareRandomness}
                        disabled={!round || cluster !== "devnet" || isSending}
                      >
                        Prepare
                      </ActionButton>
                      <ActionButton
                        onClick={handleCommitDraw}
                        disabled={!canCommit || isSending || !randomnessInput}
                      >
                        Commit
                      </ActionButton>
                      <ActionButton
                        onClick={handleRevealDraw}
                        disabled={!canReveal || isSending || !randomnessInput}
                      >
                        Reveal
                      </ActionButton>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-muted">
                    <div className="flex justify-between gap-3">
                      <span>Round randomness</span>
                      <AddressLink address={round?.randomnessAccount} />
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>Commit slot</span>
                      <span className="font-mono">
                        {round?.commitSlot.toString() ?? "-"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>Devnet only</span>
                      <span>
                        {cluster === "devnet" ? "enabled" : "disabled"}
                      </span>
                    </div>
                  </div>
                </Panel>
              </div>
            )}

            {activeTab === "explorer" && (
              <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
                <Panel title="Derived Addresses">
                  <div className="divide-y divide-border-low">
                    {explorerRows.map((row) => (
                      <div
                        key={row.label}
                        className="flex items-center justify-between gap-4 py-3 text-sm"
                      >
                        <span className="text-muted">{row.label}</span>
                        <AddressLink address={row.address} />
                      </div>
                    ))}
                  </div>
                </Panel>
                <Panel title="Decoded State">
                  <pre className="max-h-[620px] overflow-auto rounded-lg border border-border-low bg-background/60 p-3 text-xs">
                    {JSON.stringify(
                      {
                        config,
                        roundCounter: currentRound.counter.counter,
                        currentRound: round,
                        lpVault: lpVault.lpVault,
                        lpPosition: lpPosition.position,
                        referral: referral.referral,
                        subscription: subscription.subscription,
                        buyerEntry: buyerEntry.buyerEntry,
                        recentRounds: rounds.rounds.flatMap((item) =>
                          item.exists ? [item.data] : []
                        ),
                      },
                      (_key, value) =>
                        typeof value === "bigint" ? value.toString() : value,
                      2
                    )}
                  </pre>
                </Panel>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
