"use client";

import type { ReactNode } from "react";
import { Card } from "@heroui/react";

export function Panel(props: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const { title, description, action, children, className } = props;
  const hasHeader = title || description || action;
  return (
    <Card className={className}>
      {hasHeader && (
        <Card.Header>
          <div className="flex items-start justify-between gap-3">
            <div className="grid gap-1">
              {title && <Card.Title>{title}</Card.Title>}
              {description && <Card.Description>{description}</Card.Description>}
            </div>
            {action && <div className="shrink-0">{action}</div>}
          </div>
        </Card.Header>
      )}
      <Card.Content>{children}</Card.Content>
    </Card>
  );
}

export function PanelGroup(props: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`grid gap-4 ${props.className ?? ""}`}>
      {props.children}
    </div>
  );
}
