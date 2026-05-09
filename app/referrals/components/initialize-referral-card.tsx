"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Button, Card, Description, Input, Label, TextField } from "@heroui/react";
import { address as parseAddress, type Address } from "@solana/kit";
import { useInitializeReferral } from "../../lib/lottery/actions";
import { classifyError } from "../../lib/errors/classify";

function tryParseAddress(value: string): Address | undefined {
  try {
    return value.trim() ? parseAddress(value.trim()) : undefined;
  } catch {
    return undefined;
  }
}

export function InitializeReferralCard() {
  const params = useSearchParams();
  const refFromUrl = params.get("ref") ?? "";
  const [parent, setParent] = useState(refFromUrl);
  const init = useInitializeReferral();

  const parentAddress = tryParseAddress(parent);
  const parentInvalid = parent.trim().length > 0 && !parentAddress;
  const error = init.lastError ? classifyError(init.lastError) : null;

  const handleInit = async () => {
    try {
      await init.trigger({ parentReferrer: parentAddress });
    } catch {
      // surfaced via toast / alert
    }
  };

  return (
    <Card className="w-full">
      <Card.Content className="grid gap-3">
        <div className="grid gap-1">
          <span className="text-sm font-semibold">Set up your referral</span>
          <p className="text-xs text-muted">
            One-time on-chain setup. Anyone using your link from now on credits
            your wallet on every ticket.
          </p>
        </div>

        <TextField
          value={parent}
          onChange={setParent}
          aria-label="Parent referrer"
          isInvalid={parentInvalid}
        >
          <Label>Parent referrer (optional)</Label>
          <Input placeholder="Wallet address that referred you" />
          <Description>
            {parentInvalid
              ? "That doesn't look like a valid Solana address."
              : "If you arrived via someone else's link, paste their wallet here so they get credit."}
          </Description>
        </TextField>

        <Button
          variant="primary"
          fullWidth
          isPending={init.isPending}
          isDisabled={parentInvalid}
          onPress={() => void handleInit()}
        >
          Initialize referral account
        </Button>

        {error && init.lastError && (
          <Alert status={error.status}>
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{error.title}</Alert.Title>
              <Alert.Description>{init.lastError}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}
      </Card.Content>
    </Card>
  );
}
