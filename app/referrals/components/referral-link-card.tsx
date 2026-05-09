"use client";

import { useState } from "react";
import { Button, Card, Input, Label, Surface, TextField } from "@heroui/react";
import { Check, Copy, Link as LinkIcon } from "@gravity-ui/icons";

export function ReferralLinkCard(props: { walletAddress: string }) {
  const [copied, setCopied] = useState(false);

  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";
  const url = `${origin}/play?ref=${props.walletAddress}`;

  const handleCopy = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (typeof navigator === "undefined") return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "BlinkPot Lottery",
          text: "Play with me on BlinkPot — daily on-chain lotteries.",
          url,
        });
        return;
      } catch {
        // User dismissed; fall through to copy.
      }
    }
    await handleCopy();
  };

  return (
    <Card className="w-full">
      <Card.Content className="grid gap-3">
        <div className="flex items-center gap-2">
          <LinkIcon className="size-4 text-muted" />
          <span className="text-sm font-semibold">Your referral link</span>
        </div>

        <Surface variant="secondary" className="rounded-xl p-2">
          <TextField value={url} aria-label="Referral link" isReadOnly>
            <Label className="sr-only">Referral link</Label>
            <Input className="font-mono text-xs" />
          </TextField>
        </Surface>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            fullWidth
            onPress={() => void handleCopy()}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button
            variant="primary"
            size="sm"
            fullWidth
            onPress={() => void handleShare()}
          >
            Share
          </Button>
        </div>

        <p className="text-xs text-muted">
          Anyone playing through this link credits your wallet on every ticket
          they buy — for as long as their account exists.
        </p>
      </Card.Content>
    </Card>
  );
}
