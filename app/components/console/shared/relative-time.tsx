"use client";

import { useNowSeconds } from "../../../lib/lottery/now";

const SECOND = 1;
const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;

function formatRelativeFromSeconds(diff: number): string {
  const sign = diff < 0 ? "ago" : "from now";
  const abs = Math.abs(diff);
  if (abs < MINUTE) return `${Math.max(abs, 0)}s ${sign}`;
  if (abs < HOUR) {
    const m = Math.floor(abs / MINUTE);
    const s = abs % MINUTE;
    return s ? `${m}m ${s}s ${sign}` : `${m}m ${sign}`;
  }
  if (abs < DAY) {
    const h = Math.floor(abs / HOUR);
    const m = Math.floor((abs % HOUR) / MINUTE);
    return m ? `${h}h ${m}m ${sign}` : `${h}h ${sign}`;
  }
  const d = Math.floor(abs / DAY);
  const h = Math.floor((abs % DAY) / HOUR);
  return h ? `${d}d ${h}h ${sign}` : `${d}d ${sign}`;
}

export function formatTimestamp(unixSeconds?: bigint | number): string {
  if (!unixSeconds) return "-";
  const ts = typeof unixSeconds === "bigint" ? Number(unixSeconds) : unixSeconds;
  if (ts <= 0) return "-";
  return new Date(ts * 1000).toLocaleString();
}

export function RelativeTime(props: {
  unixSeconds?: bigint | number;
  showAbsolute?: boolean;
  fallback?: string;
}) {
  const now = useNowSeconds();
  const { unixSeconds, showAbsolute = true, fallback = "-" } = props;
  if (!unixSeconds) return <span className="text-muted">{fallback}</span>;
  const ts =
    typeof unixSeconds === "bigint" ? Number(unixSeconds) : unixSeconds;
  if (ts <= 0) return <span className="text-muted">{fallback}</span>;

  const diff = ts - now;
  const relative = formatRelativeFromSeconds(diff);
  void SECOND;

  if (!showAbsolute) return <span className="tabular-nums">{relative}</span>;
  return (
    <span className="tabular-nums" title={new Date(ts * 1000).toLocaleString()}>
      {relative}
    </span>
  );
}

export function Countdown(props: {
  targetUnixSeconds?: bigint | number;
  doneLabel?: string;
}) {
  const now = useNowSeconds();
  const target = props.targetUnixSeconds;
  if (!target) return <span className="text-muted">-</span>;
  const ts = typeof target === "bigint" ? Number(target) : target;
  const remaining = ts - now;
  if (remaining <= 0)
    return (
      <span className="font-semibold tabular-nums text-amber-600 dark:text-amber-400">
        {props.doneLabel ?? "Ready"}
      </span>
    );

  const h = Math.floor(remaining / HOUR);
  const m = Math.floor((remaining % HOUR) / MINUTE);
  const s = remaining % MINUTE;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (h > 0 || m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return <span className="tabular-nums">{parts.join(" ")}</span>;
}
