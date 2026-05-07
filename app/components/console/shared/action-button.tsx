"use client";

import type { ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

export function ActionButton(props: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: Variant;
  type?: "button" | "submit";
  size?: "sm" | "md";
  isPending?: boolean;
  pendingLabel?: ReactNode;
  className?: string;
}) {
  const {
    children,
    onClick,
    disabled,
    variant = "secondary",
    type = "button",
    size = "md",
    isPending,
    pendingLabel,
    className = "",
  } = props;

  const variantClass =
    variant === "primary"
      ? "bg-primary text-primary-foreground hover:bg-primary/90"
      : variant === "danger"
        ? "border border-destructive/30 text-destructive hover:bg-destructive/10"
        : variant === "ghost"
          ? "text-foreground hover:bg-cream"
          : "border border-border-low bg-card hover:bg-cream";

  const sizeClass =
    size === "sm" ? "h-7 px-2 text-[11px]" : "h-9 px-3 text-xs";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || isPending}
      className={`cursor-pointer rounded-lg font-semibold transition disabled:pointer-events-none disabled:opacity-45 ${variantClass} ${sizeClass} ${className}`}
    >
      {isPending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}
