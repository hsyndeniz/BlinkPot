"use client";

import { useState } from "react";
import type { Address } from "@solana/kit";
import { useCluster } from "../../cluster-context";
import { ellipsify } from "../../../lib/explorer";

export function AddressLink(props: {
  address?: Address | string;
  label?: string;
  truncate?: number;
  showCopy?: boolean;
}) {
  const { getExplorerUrl } = useCluster();
  const { address, label, truncate = 4, showCopy = false } = props;
  const [copied, setCopied] = useState(false);

  if (!address) return <span className="text-muted">-</span>;

  const display = label ?? ellipsify(address, truncate);
  const handleCopy = async () => {
    if (!navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <a
        href={getExplorerUrl(`/address/${address}`)}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-xs text-foreground underline underline-offset-4"
      >
        {display}
      </a>
      {showCopy && (
        <button
          type="button"
          onClick={handleCopy}
          className="text-[10px] text-muted hover:text-foreground"
          aria-label="Copy address"
        >
          {copied ? "✓" : "copy"}
        </button>
      )}
    </span>
  );
}
