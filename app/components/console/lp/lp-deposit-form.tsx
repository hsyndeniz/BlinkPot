"use client";

import { useState } from "react";
import { useConfig } from "../../../lib/lottery/accounts";
import { useLpDeposit } from "../../../lib/lottery/actions";
import {
  parseTokenAmount,
  useMint,
  useTokenSymbol,
} from "../../../lib/lottery/tokens";
import { ActionButton, Panel, TokenAmountInput } from "../shared";

export function LpDepositForm() {
  const { config } = useConfig();
  const { decimals } = useMint(config?.paymentMint);
  const symbol = useTokenSymbol(config?.paymentMint);
  const deposit = useLpDeposit();
  const [amount, setAmount] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setLocalError(null);
    try {
      const parsed = parseTokenAmount(amount, decimals);
      if (parsed <= 0n) throw new Error("Enter a positive amount.");
      await deposit.trigger({ amount: parsed }).catch(() => {});
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Panel title="Deposit">
      <div className="grid gap-3">
        <TokenAmountInput
          label="Amount"
          value={amount}
          onChange={setAmount}
          symbol={symbol}
          hint="Whole-token amount; converted to base units automatically."
        />
        {(localError ?? deposit.lastError) && (
          <p className="text-xs text-destructive">
            {localError ?? deposit.lastError}
          </p>
        )}
        <div className="flex justify-end">
          <ActionButton
            variant="primary"
            size="sm"
            isPending={deposit.isPending}
            onClick={() => void handleSubmit()}
          >
            Deposit
          </ActionButton>
        </div>
      </div>
    </Panel>
  );
}
