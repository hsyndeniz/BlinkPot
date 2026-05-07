"use client";

import type { ReactNode } from "react";

export function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-muted">
      <span>{props.label}</span>
      <input
        type={props.type ?? "text"}
        value={props.value}
        placeholder={props.placeholder}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.value)}
        className="h-9 rounded-lg border border-border-low bg-card px-3 text-sm text-foreground outline-none transition focus:border-foreground/30 disabled:opacity-50"
      />
      {props.hint && (
        <span className="text-[10px] font-normal text-muted">{props.hint}</span>
      )}
    </label>
  );
}

export function SelectField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-muted">
      <span>{props.label}</span>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        disabled={props.disabled}
        className="h-9 rounded-lg border border-border-low bg-card px-3 text-sm text-foreground outline-none transition focus:border-foreground/30 disabled:opacity-50"
      >
        {props.children}
      </select>
      {props.hint && (
        <span className="text-[10px] font-normal text-muted">{props.hint}</span>
      )}
    </label>
  );
}

export function ToggleField(props: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  return (
    <label className="flex items-start gap-3 text-xs font-medium text-muted">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
        disabled={props.disabled}
        className="mt-0.5 size-4"
      />
      <span className="grid gap-0.5">
        <span className="text-foreground">{props.label}</span>
        {props.hint && (
          <span className="text-[10px] font-normal text-muted">
            {props.hint}
          </span>
        )}
      </span>
    </label>
  );
}
