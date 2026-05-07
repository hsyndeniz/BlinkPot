"use client";

import type { ReactNode } from "react";

export function Panel(props: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const { title, description, action, children, className = "" } = props;
  return (
    <section
      className={`rounded-lg border border-border-low bg-card p-4 ${className}`}
    >
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="grid gap-1">
            {title && (
              <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
            )}
            {description && (
              <p className="text-xs text-muted">{description}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function PanelGroup(props: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`grid gap-4 ${props.className ?? ""}`}>{props.children}</div>
  );
}
