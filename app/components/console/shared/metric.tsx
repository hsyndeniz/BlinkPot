"use client";

import type { ReactNode } from "react";

export function Metric(props: {
  label: ReactNode;
  value: ReactNode;
  subvalue?: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const { label, value, subvalue, tone = "neutral" } = props;
  const valueClass =
    tone === "good"
      ? "text-green-600 dark:text-green-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "bad"
          ? "text-destructive"
          : "";
  return (
    <div className="rounded-lg border border-border-low bg-background/60 px-3 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${valueClass}`}>
        {value}
      </p>
      {subvalue && <p className="mt-1 text-xs text-muted">{subvalue}</p>}
    </div>
  );
}

export function MetricGrid(props: {
  children: ReactNode;
  columns?: 2 | 3 | 4;
}) {
  const cols = props.columns ?? 3;
  const className =
    cols === 2
      ? "grid grid-cols-1 gap-3 sm:grid-cols-2"
      : cols === 3
        ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4";
  return <div className={className}>{props.children}</div>;
}
