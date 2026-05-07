"use client";

import type { ReadonlyUint8Array } from "@solana/kit";

export function BallPill(props: {
  value: number;
  variant?: "normal" | "bonus" | "winning" | "winning-bonus";
}) {
  const { value, variant = "normal" } = props;
  const variantClass =
    variant === "bonus"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : variant === "winning"
        ? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300"
        : variant === "winning-bonus"
          ? "border-amber-500/40 bg-amber-500/20 text-amber-800 dark:text-amber-200"
          : "border-border-low bg-card text-foreground";
  return (
    <span
      className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums ${variantClass}`}
    >
      {value}
    </span>
  );
}

export function BallStrip(props: {
  normals: ReadonlyUint8Array | ArrayLike<number>;
  bonusball: number;
  winningNormals?: ReadonlyUint8Array | ArrayLike<number>;
  winningBonusball?: number;
  className?: string;
}) {
  const normals = Array.from(props.normals as ArrayLike<number>);
  const winningSet = props.winningNormals
    ? new Set(Array.from(props.winningNormals as ArrayLike<number>))
    : undefined;
  const bonusMatches =
    props.winningBonusball != null && props.winningBonusball === props.bonusball;

  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${props.className ?? ""}`}>
      {normals.map((n, i) => (
        <BallPill
          key={`n-${i}-${n}`}
          value={n}
          variant={winningSet?.has(n) ? "winning" : "normal"}
        />
      ))}
      <span className="mx-0.5 text-muted">·</span>
      <BallPill
        value={props.bonusball}
        variant={bonusMatches ? "winning-bonus" : "bonus"}
      />
    </span>
  );
}

