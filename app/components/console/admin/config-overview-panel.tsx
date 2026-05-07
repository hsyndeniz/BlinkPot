"use client";

import { UntakenTierDestination } from "../../../generated/lottery";
import { useConfig, useRoundCounter } from "../../../lib/lottery/accounts";
import { useMint, useTokenSymbol } from "../../../lib/lottery/tokens";
import {
  AddressLink,
  EmptyState,
  Metric,
  MetricGrid,
  Panel,
  StatusBadge,
  TokenAmount,
} from "../shared";

export function ConfigOverviewPanel() {
  const { config, address } = useConfig();
  const { decimals } = useMint(config?.paymentMint);
  const symbol = useTokenSymbol(config?.paymentMint);
  const { counter } = useRoundCounter();

  if (!config)
    return (
      <Panel title="Config">
        <EmptyState
          title="Config not initialized"
          description="Initialize the lottery config to begin operations."
        />
      </Panel>
    );

  return (
    <div className="grid gap-4">
      <Panel
        title="Config"
        description={
          <span className="flex flex-wrap items-center gap-2">
            <AddressLink address={address} showCopy />
            <span className="text-muted">·</span>
            <AddressLink
              address={config.admin}
              showCopy
              label={`admin: ${config.admin.slice(0, 4)}…${config.admin.slice(-4)}`}
            />
            <StatusBadge tone={config.paused ? "warn" : "good"}>
              {config.paused ? "Paused" : "Live"}
            </StatusBadge>
            <StatusBadge tone={config.emergencyMode ? "bad" : "neutral"}>
              {config.emergencyMode ? "Emergency" : "Normal"}
            </StatusBadge>
          </span>
        }
      >
        <MetricGrid columns={3}>
          <Metric
            label="Payment mint"
            value={
              <AddressLink address={config.paymentMint} truncate={4} showCopy />
            }
            subvalue={`${symbol} · ${config.paymentDecimals} decimals`}
          />
          <Metric
            label="Default ticket price"
            value={
              <TokenAmount
                amount={config.defaultTicketPrice}
                decimals={decimals}
                mint={config.paymentMint}
                showSymbol={false}
              />
            }
            subvalue={symbol}
          />
          <Metric
            label="Default round duration"
            value={`${config.defaultRoundDurationSecs.toString()}s`}
            subvalue={`${(Number(config.defaultRoundDurationSecs) / 3600).toFixed(2)}h`}
          />
          <Metric
            label="Guaranteed prize pool"
            value={
              <TokenAmount
                amount={config.guaranteedPrizePool}
                decimals={decimals}
                mint={config.paymentMint}
                showSymbol={false}
              />
            }
            subvalue={`Cap: ${config.maxGuaranteePerRoundBps} bps NAV`}
          />
          <Metric
            label="LP edge"
            value={`${config.lpEdgeBps} bps`}
          />
          <Metric
            label="Referral fees"
            value={`${config.referralFeeFirstBps + config.referralFeeSecondBps} bps`}
            subvalue={`1st ${config.referralFeeFirstBps} · 2nd ${config.referralFeeSecondBps}`}
          />
          <Metric
            label="Referral win share"
            value={`${config.referralWinShareFirstBps + config.referralWinShareSecondBps} bps`}
            subvalue={`1st ${config.referralWinShareFirstBps} · 2nd ${config.referralWinShareSecondBps}`}
          />
          <Metric
            label="LP pool cap"
            value={
              config.lpPoolCap === 0n ? (
                "Uncapped"
              ) : (
                <TokenAmount
                  amount={config.lpPoolCap}
                  decimals={decimals}
                  mint={config.paymentMint}
                  showSymbol={false}
                />
              )
            }
            subvalue={config.lpPoolCap === 0n ? "" : symbol}
          />
          <Metric
            label="Bonusball"
            value={
              config.dynamicBonusballEnabled
                ? `dynamic from ${config.bonusballBase}`
                : `static ${config.bonusballMax}`
            }
            subvalue={
              config.dynamicBonusballEnabled
                ? `+1 per ${config.bonusballPoolStepUnits.toString()} units`
                : "static"
            }
          />
          <Metric
            label="Premium min allocation"
            value={`${config.premiumMinAllocationBps} bps`}
          />
          <Metric
            label="Untaken tier destination"
            value={
              config.untakenTierDestination === UntakenTierDestination.LpPool
                ? "LP pool"
                : "Next round"
            }
          />
          <Metric
            label="Draw timeout slots"
            value={config.drawTimeoutSlots.toString()}
          />
          {counter && (
            <Metric
              label="Round counter"
              value={`#${counter.currentRoundId.toString()}`}
              subvalue={`Last settled #${counter.lastSettledRoundId.toString()}`}
            />
          )}
        </MetricGrid>
      </Panel>
    </div>
  );
}
