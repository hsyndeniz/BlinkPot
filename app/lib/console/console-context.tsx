"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

export type ConsoleTab =
  | "overview"
  | "player"
  | "lp"
  | "referral"
  | "subscription"
  | "admin"
  | "operations"
  | "emergency"
  | "activity";

export type TicketFilter = "all" | "winning" | "losing" | "claimed" | "unclaimed";

type ConsoleContextValue = {
  activeTab: ConsoleTab;
  setActiveTab: Dispatch<SetStateAction<ConsoleTab>>;
  selectedRoundId: bigint | undefined;
  setSelectedRoundId: (id: bigint | undefined) => void;
  selectedTicketIndex: bigint | undefined;
  setSelectedTicketIndex: (index: bigint | undefined) => void;
  ticketFilter: TicketFilter;
  setTicketFilter: Dispatch<SetStateAction<TicketFilter>>;
};

const ConsoleContext = createContext<ConsoleContextValue | null>(null);

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState<ConsoleTab>("overview");
  const [selectedRoundId, setSelectedRoundIdState] = useState<bigint | undefined>(
    undefined
  );
  const [selectedTicketIndex, setSelectedTicketIndexState] = useState<
    bigint | undefined
  >(undefined);
  const [ticketFilter, setTicketFilter] = useState<TicketFilter>("all");

  const setSelectedRoundId = useCallback((id: bigint | undefined) => {
    setSelectedRoundIdState(id);
    setSelectedTicketIndexState(undefined);
  }, []);

  const setSelectedTicketIndex = useCallback((index: bigint | undefined) => {
    setSelectedTicketIndexState(index);
  }, []);

  const value = useMemo<ConsoleContextValue>(
    () => ({
      activeTab,
      setActiveTab,
      selectedRoundId,
      setSelectedRoundId,
      selectedTicketIndex,
      setSelectedTicketIndex,
      ticketFilter,
      setTicketFilter,
    }),
    [activeTab, selectedRoundId, setSelectedRoundId, selectedTicketIndex, setSelectedTicketIndex, ticketFilter]
  );

  return (
    <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>
  );
}

export function useConsole(): ConsoleContextValue {
  const ctx = useContext(ConsoleContext);
  if (!ctx)
    throw new Error("useConsole must be used within ConsoleProvider");
  return ctx;
}
