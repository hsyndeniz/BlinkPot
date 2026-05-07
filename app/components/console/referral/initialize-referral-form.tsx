"use client";

import { useState } from "react";
import { address as parseAddress, type Address } from "@solana/kit";
import { useInitializeReferral } from "../../../lib/lottery/actions";
import { useWallet } from "../../../lib/wallet/context";
import { ActionButton, Field, Panel } from "../shared";

function tryParseAddress(value: string): Address | undefined {
  try {
    return value.trim() ? parseAddress(value.trim()) : undefined;
  } catch {
    return undefined;
  }
}

export function InitializeReferralForm() {
  const { signer, wallet } = useWallet();
  const walletAddress = signer?.address ?? wallet?.account.address;
  const init = useInitializeReferral();
  const [parentInput, setParentInput] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setLocalError(null);
    try {
      const parent = tryParseAddress(parentInput);
      if (parent && walletAddress && parent === walletAddress) {
        throw new Error("Parent referrer cannot be your own wallet.");
      }
      await init.trigger({ parentReferrer: parent }).catch(() => {});
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Panel
      title="Initialize referral"
      description="Create your Referral PDA. Optionally set a parent (upstream) referrer."
    >
      <div className="grid gap-3">
        <Field
          label="Parent referrer (optional)"
          value={parentInput}
          onChange={setParentInput}
          placeholder="Pubkey of upstream referrer"
        />
        {(localError ?? init.lastError) && (
          <p className="text-xs text-destructive">
            {localError ?? init.lastError}
          </p>
        )}
        <div className="flex justify-end">
          <ActionButton
            variant="primary"
            size="sm"
            isPending={init.isPending}
            onClick={() => void handleSubmit()}
          >
            Initialize
          </ActionButton>
        </div>
      </div>
    </Panel>
  );
}
