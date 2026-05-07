"use client";

import { PanelGroup } from "../shared";
import { BuyTicketsPanel } from "./buy-tickets-panel";
import { PickCounterLookup } from "./pick-counter-lookup";
import { TicketList } from "./ticket-list";

export function PlayerPanel() {
  return (
    <PanelGroup>
      <BuyTicketsPanel />
      <TicketList />
      <PickCounterLookup />
    </PanelGroup>
  );
}
