"use client";

import type { ReactNode } from "react";
import { Button } from "@heroui/react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANT_MAP: Record<
  Variant,
  "primary" | "outline" | "danger" | "ghost"
> = {
  primary: "primary",
  secondary: "outline",
  danger: "danger",
  ghost: "ghost",
};

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
    className,
  } = props;

  return (
    <Button
      type={type}
      size={size}
      variant={VARIANT_MAP[variant]}
      isDisabled={disabled}
      isPending={isPending}
      onPress={onClick}
      className={className}
    >
      {isPending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
