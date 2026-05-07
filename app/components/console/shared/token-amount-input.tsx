"use client";

export function TokenAmountInput(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  symbol?: string;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-muted">
      <span>{props.label}</span>
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder ?? "0"}
          disabled={props.disabled}
          className="h-9 flex-1 rounded-lg border border-border-low bg-card px-3 text-sm tabular-nums text-foreground outline-none transition focus:border-foreground/30 disabled:opacity-50"
        />
        {props.symbol && (
          <span className="text-xs text-muted">{props.symbol}</span>
        )}
      </div>
      {props.hint && (
        <span className="text-[10px] font-normal text-muted">{props.hint}</span>
      )}
    </label>
  );
}
