"use client";

export function DecimalsHeadsUp(props: {
  decimals: number;
  detected: boolean;
  symbol?: string;
}) {
  return (
    <div className="rounded-lg border border-border-low bg-blue-50 p-3 text-xs leading-relaxed text-foreground/80 dark:bg-blue-950/20">
      <strong className="font-semibold text-foreground">
        Amount fields use whole {props.symbol ?? "token"} units.
      </strong>{" "}
      <span>
        Enter <em>whole-token amounts</em> (e.g. <code className="font-mono">1</code> for
        1 token, <code className="font-mono">0.25</code> for ¼ token) — the form converts
        them to base units automatically using the mint&rsquo;s decimals.
      </span>{" "}
      {props.detected ? (
        <span>
          Detected:{" "}
          <span className="font-mono font-semibold text-foreground">
            {props.decimals} decimals
          </span>
          .
        </span>
      ) : (
        <span className="text-muted">
          Decimals will be detected once the payment mint resolves.
        </span>
      )}
    </div>
  );
}
