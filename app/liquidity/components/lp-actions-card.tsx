"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  NumberField,
  Tabs,
} from "@heroui/react";
import { ArrowDown, ArrowUp } from "@gravity-ui/icons";
import type { Address } from "@solana/kit";
import {
  useConfig,
  useLpPosition,
  useLpVault,
} from "../../lib/lottery/accounts";
import {
  useLpDeposit,
  useLpInitiateWithdraw,
} from "../../lib/lottery/actions";
import {
  formatTokenAmount,
  parseTokenAmount,
  useMint,
  useTokenAccount,
  useTokenSymbol,
} from "../../lib/lottery/tokens";
import { classifyError } from "../../lib/errors/classify";
import { assetsForShares, sharesForDeposit } from "../_lp-math";

export function LpActionsCard(props: { walletAddress: Address }) {
  const { walletAddress } = props;
  const { config } = useConfig();
  const { decimals } = useMint(config?.paymentMint);
  const symbol = useTokenSymbol(config?.paymentMint);
  const userToken = useTokenAccount(walletAddress, config?.paymentMint);
  const { lpVault } = useLpVault();
  const { position } = useLpPosition(walletAddress);

  const deposit = useLpDeposit();
  const initiate = useLpInitiateWithdraw();

  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [depositInput, setDepositInput] = useState("");
  const [withdrawInput, setWithdrawInput] = useState("");

  const fmt = (v: bigint) =>
    `${formatTokenAmount(v, decimals, { maxDecimals: 2 })} ${symbol}`;

  const totalShares = lpVault?.totalShares ?? 0n;
  const totalAssets = lpVault?.totalAssets ?? 0n;
  const userShares = position?.shares ?? 0n;
  const pendingShares = position?.pendingWithdrawShares ?? 0n;

  // ─── Deposit ──────────────────────────────────────────────────────────
  const balance = userToken.amount;
  const depositAmount = (() => {
    if (!depositInput.trim()) return 0n;
    try {
      return parseTokenAmount(depositInput.trim(), decimals);
    } catch {
      return 0n;
    }
  })();
  const estimatedShares = sharesForDeposit(
    depositAmount,
    totalShares,
    totalAssets
  );
  const overBalance = depositAmount > balance;
  // `lpPoolCap === 0` means the pool is uncapped on-chain (mirrors the
  // `if cap > 0` guard in `lp_deposit`).
  const overCap =
    config != null &&
    config.lpPoolCap > 0n &&
    totalAssets + depositAmount > config.lpPoolCap;

  const depositBlocked =
    !config ||
    config.paused ||
    config.emergencyMode ||
    depositAmount <= 0n ||
    overBalance ||
    overCap;
  const depositReason = !config
    ? "Config not initialized"
    : config.paused
      ? "Protocol paused"
      : config.emergencyMode
        ? "Emergency mode"
        : depositAmount <= 0n
          ? null
          : overBalance
            ? `Insufficient ${symbol}`
            : overCap
              ? "Pool cap exceeded"
              : null;
  const depositError = deposit.lastError
    ? classifyError(deposit.lastError)
    : null;

  const handleDeposit = async () => {
    if (depositAmount <= 0n) return;
    try {
      await deposit.trigger({ amount: depositAmount });
      setDepositInput("");
    } catch {
      // surfaced via toast / alert
    }
  };

  // ─── Withdraw ─────────────────────────────────────────────────────────
  // The chain instruction takes shares, but the user thinks in tokens. Take
  // a token amount as input, convert to shares for submission.
  const userValue = assetsForShares(userShares, totalShares, totalAssets);
  const withdrawAmount = (() => {
    if (!withdrawInput.trim()) return 0n;
    try {
      return parseTokenAmount(withdrawInput.trim(), decimals);
    } catch {
      return 0n;
    }
  })();
  const withdrawSharesEstimate = sharesForDeposit(
    withdrawAmount,
    totalShares,
    totalAssets
  );
  const overValue = withdrawAmount > userValue;
  const hasPendingAlready = pendingShares > 0n;

  const withdrawBlocked =
    !config ||
    config.paused ||
    config.emergencyMode ||
    withdrawAmount <= 0n ||
    overValue ||
    hasPendingAlready;
  const withdrawReason = !config
    ? "Config not initialized"
    : config.paused
      ? "Protocol paused"
      : config.emergencyMode
        ? "Emergency mode"
        : hasPendingAlready
          ? "Withdraw already pending"
          : withdrawAmount <= 0n
            ? null
            : overValue
              ? "Exceeds your liquidity"
              : null;
  const initiateError = initiate.lastError
    ? classifyError(initiate.lastError)
    : null;

  const handleInitiateWithdraw = async () => {
    if (withdrawAmount <= 0n) return;
    // If the user is withdrawing their full position (or the rounded shares
    // would equal/exceed their total), burn all of their shares so we never
    // leave a stranded dust amount unable to be finalised.
    const sharesToBurn =
      withdrawAmount >= userValue || withdrawSharesEstimate >= userShares
        ? userShares
        : withdrawSharesEstimate;
    if (sharesToBurn <= 0n) return;
    try {
      await initiate.trigger({ shares: sharesToBurn });
      setWithdrawInput("");
    } catch {
      // surfaced via toast / alert
    }
  };

  return (
    <Card className="w-full">
      <Card.Content className="grid gap-3">
        <Tabs
          selectedKey={tab}
          onSelectionChange={(k) => setTab(k as "deposit" | "withdraw")}
        >
          <Tabs.ListContainer>
            <Tabs.List aria-label="LP actions">
              <Tabs.Tab id="deposit">
                <ArrowDown />
                Deposit
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="withdraw">
                <ArrowUp />
                Withdraw
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>

          <Tabs.Panel id="deposit">
            <div className="grid gap-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">Wallet balance</span>
                <button
                  type="button"
                  className="font-semibold tabular-nums underline-offset-2 hover:underline cursor-pointer"
                  onClick={() => {
                    if (balance > 0n) {
                      setDepositInput(
                        formatTokenAmount(balance, decimals, {
                          maxDecimals: decimals,
                        })
                      );
                    }
                  }}
                >
                  {fmt(balance)}
                </button>
              </div>
              <NumberField
                variant="secondary"
                value={Number(depositInput) || 0}
                minValue={0}
                onChange={(v) => setDepositInput(String(v))}
                aria-label={`Deposit amount in ${symbol}`}
                fullWidth
                formatOptions={{
                  maximumFractionDigits: decimals,
                }}
              >
                <NumberField.Group className="h-12">
                  <NumberField.DecrementButton />
                  <NumberField.Input className="text-center font-semibold" />
                  <NumberField.IncrementButton />
                </NumberField.Group>
              </NumberField>

              {depositAmount > 0n && (
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>Estimated shares</span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {estimatedShares.toString()}
                  </span>
                </div>
              )}

              <Button
                variant="primary"
                size="lg"
                fullWidth
                isPending={deposit.isPending}
                isDisabled={depositBlocked}
                onPress={() => void handleDeposit()}
              >
                {depositReason ?? `Deposit · ${fmt(depositAmount)}`}
              </Button>

              {depositError && deposit.lastError && (
                <Alert status={depositError.status}>
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>{depositError.title}</Alert.Title>
                    <Alert.Description>{deposit.lastError}</Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
            </div>
          </Tabs.Panel>

          <Tabs.Panel id="withdraw">
            <div className="grid gap-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">Your liquidity</span>
                <button
                  type="button"
                  className="font-semibold tabular-nums underline-offset-2 hover:underline cursor-pointer"
                  onClick={() => {
                    if (userValue > 0n) {
                      setWithdrawInput(
                        formatTokenAmount(userValue, decimals, {
                          maxDecimals: decimals,
                        })
                      );
                    }
                  }}
                >
                  {fmt(userValue)}
                </button>
              </div>
              <NumberField
                variant="secondary"
                value={Number(withdrawInput) || 0}
                minValue={0}
                onChange={(v) => setWithdrawInput(String(Math.max(0, v)))}
                aria-label={`Withdraw amount in ${symbol}`}
                fullWidth
                formatOptions={{ maximumFractionDigits: decimals }}
              >
                <NumberField.Group className="h-12">
                  <NumberField.DecrementButton />
                  <NumberField.Input className="text-center font-semibold" />
                  <NumberField.IncrementButton />
                </NumberField.Group>
              </NumberField>

              {withdrawAmount > 0n && (
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>Burns approx.</span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {(withdrawAmount >= userValue
                      ? userShares
                      : withdrawSharesEstimate
                    ).toString()}{" "}
                    shares
                  </span>
                </div>
              )}

              <Button
                variant="primary"
                size="lg"
                fullWidth
                isPending={initiate.isPending}
                isDisabled={withdrawBlocked}
                onPress={() => void handleInitiateWithdraw()}
              >
                {withdrawReason ??
                  `Initiate withdraw · ${fmt(withdrawAmount)}`}
              </Button>

              <p className="text-xs text-muted">
                Initiating starts a cooldown until the current round ends. You
                finalize from the &quot;Your position&quot; card on the left to
                receive the assets.
              </p>

              {initiateError && initiate.lastError && (
                <Alert status={initiateError.status}>
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>{initiateError.title}</Alert.Title>
                    <Alert.Description>{initiate.lastError}</Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
            </div>
          </Tabs.Panel>
        </Tabs>
      </Card.Content>
    </Card>
  );
}
