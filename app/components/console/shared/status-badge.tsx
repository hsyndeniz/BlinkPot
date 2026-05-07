"use client";

import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "good" | "warn" | "bad" | "info";

export function StatusBadge(props: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  const tone = props.tone ?? "neutral";
  const toneClass =
    tone === "good"
      ? "border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-300"
      : tone === "warn"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : tone === "bad"
          ? "border-destructive/20 bg-destructive/10 text-destructive"
          : tone === "info"
            ? "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300"
            : "border-border-low bg-cream text-foreground/70";
  return (
    <span
      className={`inline-flex rounded-lg border px-2 py-1 text-xs font-semibold ${toneClass} ${props.className ?? ""}`}
    >
      {props.children}
    </span>
  );
}
