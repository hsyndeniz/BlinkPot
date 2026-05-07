"use client";

import { useState } from "react";
import type { Address } from "@solana/kit";
import { address as parseAddress } from "@solana/kit";
import {
  useInitializeConfig,
  useUpdateConfig,
} from "../../../lib/lottery/actions";
import { useConfig } from "../../../lib/lottery/accounts";
import { useIsAdmin } from "../../../lib/lottery/admin";
import {
  formToConfigParams,
  useConfigForm,
} from "../../../lib/lottery/forms/config-form";
import { useMint, useTokenSymbol } from "../../../lib/lottery/tokens";
import {
  ActionButton,
  DecimalsHeadsUp,
  Field,
  Panel,
  StatusBadge,
} from "../shared";
import { ConfigFormFields } from "./config-form-fields";

function tryParseAddress(value: string): Address | undefined {
  try {
    return value.trim() ? parseAddress(value.trim()) : undefined;
  } catch {
    return undefined;
  }
}

export function ConfigEditorPanel() {
  const { config } = useConfig();
  const isAdmin = useIsAdmin();
  const initializeConfig = useInitializeConfig();
  const updateConfig = useUpdateConfig();

  const [setupMintInput, setSetupMintInput] = useState("");
  const setupMintAddress = tryParseAddress(setupMintInput);
  const setupMint = useMint(setupMintAddress);

  const liveMint = useMint(config?.paymentMint);
  const decimals = config ? liveMint.decimals : setupMint.decimals;
  const symbol = useTokenSymbol(config?.paymentMint ?? setupMintAddress);

  const formState = useConfigForm(config, decimals);
  const isInit = !config;
  const isPending = initializeConfig.isPending || updateConfig.isPending;
  const error = initializeConfig.lastError ?? updateConfig.lastError;

  const handleSubmit = async () => {
    try {
      const params = formToConfigParams(formState.form, decimals);
      if (isInit) {
        if (!setupMintAddress) {
          throw new Error("Enter a valid payment mint address.");
        }
        await initializeConfig
          .trigger({ paymentMint: setupMintAddress, params })
          .catch(() => {});
      } else {
        await updateConfig.trigger({ params }).catch(() => {});
      }
    } catch {
      // errors are surfaced via lastError + toast in the action hooks.
    }
  };

  return (
    <Panel
      title={isInit ? "Initialize config" : "Update config"}
      description={
        isInit ? (
          <span>
            Set the payment mint and seed all on-chain parameters in a single
            transaction.
          </span>
        ) : (
          <span className="flex items-center gap-2">
            {formState.dirty && (
              <StatusBadge tone="warn">Unsaved changes</StatusBadge>
            )}
            {!isAdmin && <StatusBadge tone="bad">Read-only</StatusBadge>}
          </span>
        )
      }
      action={
        <div className="flex items-center gap-2">
          {!isInit && formState.dirty && (
            <ActionButton
              variant="secondary"
              size="sm"
              onClick={formState.resetFromChain}
              disabled={isPending}
            >
              Reset
            </ActionButton>
          )}
          <ActionButton
            variant="primary"
            size="sm"
            disabled={
              !isInit &&
              (!isAdmin ||
                !formState.dirty)
            }
            isPending={isPending}
            onClick={() => void handleSubmit()}
          >
            {isInit ? "Initialize" : "Update"}
          </ActionButton>
        </div>
      }
    >
      <div className="grid gap-4">
        {isInit && (
          <Field
            label="Payment mint address"
            value={setupMintInput}
            onChange={setSetupMintInput}
            placeholder="SPL token mint (USDC, etc.)"
            hint="Pinned at init and immutable thereafter."
          />
        )}

        <DecimalsHeadsUp
          decimals={decimals}
          detected={!!(config || setupMint.mint)}
          symbol={symbol}
        />

        <ConfigFormFields
          form={formState.form}
          symbol={symbol}
          onChange={formState.update}
          disabled={!isInit && !isAdmin}
        />

        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </Panel>
  );
}
