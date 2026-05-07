"use client";

import type { ReactNode } from "react";

export function EmptyState(props: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-dashed border-border-low bg-background/40 p-6 text-center">
      {props.title && (
        <p className="text-sm font-semibold text-foreground/80">{props.title}</p>
      )}
      {props.description && (
        <p className="text-xs text-muted">{props.description}</p>
      )}
      {props.action && <div className="mt-1 flex justify-center">{props.action}</div>}
    </div>
  );
}

export function Skeleton(props: {
  className?: string;
  rows?: number;
}) {
  const rows = props.rows ?? 3;
  return (
    <div className={`grid gap-2 ${props.className ?? ""}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-4 rounded-md bg-cream/70 dark:bg-card"
          style={{ width: `${60 + ((i * 17) % 35)}%` }}
        />
      ))}
    </div>
  );
}
