"use client";

import { useState } from "react";
import { useLpInitiateWithdraw } from "../../../lib/lottery/actions";
import { ActionButton, Field, Panel } from "../shared";

export function LpInitiateWithdrawForm() {
  const initiate = useLpInitiateWithdraw();
  const [shares, setShares] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setLocalError(null);
    try {
      const parsed = BigInt(shares);
      if (parsed <= 0n) throw new Error("Shares must be positive.");
      await initiate.trigger({ shares: parsed }).catch(() => {});
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Panel
      title="Initiate withdraw"
      description="Move shares to pending. Cooldown: at least one full round must elapse before finalize."
    >
      <div className="grid gap-3">
        <Field
          label="Shares to withdraw (raw u64)"
          value={shares}
          onChange={setShares}
          placeholder="0"
          hint="Use raw share units; check your active shares above."
        />
        {(localError ?? initiate.lastError) && (
          <p className="text-xs text-destructive">
            {localError ?? initiate.lastError}
          </p>
        )}
        <div className="flex justify-end">
          <ActionButton
            variant="secondary"
            size="sm"
            isPending={initiate.isPending}
            onClick={() => void handleSubmit()}
          >
            Initiate
          </ActionButton>
        </div>
      </div>
    </Panel>
  );
}
