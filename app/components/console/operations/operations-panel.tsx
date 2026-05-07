"use client";

import { ArchiveRoundCta } from "./archive-round-cta";
import { DrawController } from "./draw-controller";
import { EnterRoundEmergencyCta } from "./enter-round-emergency-cta";
import { StartRoundForm } from "./start-round-form";
import { PanelGroup } from "../shared";

export function OperationsPanel() {
  return (
    <PanelGroup>
      <StartRoundForm />
      <DrawController />
      <ArchiveRoundCta />
      <EnterRoundEmergencyCta />
    </PanelGroup>
  );
}
