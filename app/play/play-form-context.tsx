"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Pick = {
  /** Stable identity used as a React key — preserved across shuffle/edit
   * so removing a ticket doesn't reshuffle the surviving rows. */
  id: string;
  /** Sorted ascending. Length 5. Each entry 0 = unfilled. */
  normals: number[];
  /** 0 = unfilled. */
  bonus: number;
};

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export const MIN_QUANTITY = 1;
// Capped at 7 to stay safely equal to the on-chain `MAX_TICKETS_PER_BATCH` (7).
// Lift once we add Address Lookup Tables or drop per-ticket PDAs.
export const MAX_QUANTITY = 7;
export const PRESET_QUANTITIES = [1, 3, 5, 7] as const;

export const SUBSCRIPTION_DAY_OPTIONS = [3, 7, 30] as const;
export type SubscriptionDays = (typeof SUBSCRIPTION_DAY_OPTIONS)[number];

function emptyPick(): Pick {
  return { id: makeId(), normals: [0, 0, 0, 0, 0], bonus: 0 };
}

function quickPick(normalMax: number, bonusMax: number): Pick {
  const pool = Array.from({ length: normalMax }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > pool.length - 6; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return {
    id: makeId(),
    normals: pool.slice(-5).sort((a, b) => a - b),
    bonus: 1 + Math.floor(Math.random() * bonusMax),
  };
}

export function isPickFilled(pick: Pick): boolean {
  return pick.normals.every((n) => n > 0) && pick.bonus > 0;
}

type PlayFormState = {
  quantity: number;
  picks: Pick[];
  editorIndex: number | null;
  checkoutOpen: boolean;
  normalMax: number;
  bonusMax: number;
};

type PlayFormActions = {
  setQuantity: (n: number) => void;
  addTicket: () => void;
  removeTicket: (index: number) => void;
  shuffleTicket: (index: number) => void;
  clearTicket: (index: number) => void;
  shuffleAll: () => void;
  clearAll: () => void;
  setPick: (index: number, pick: Omit<Pick, "id">) => void;
  finalizePicks: () => Pick[];
  openEditor: (index: number) => void;
  closeEditor: () => void;
  openCheckout: () => void;
  closeCheckout: () => void;
};

type PlayFormContextValue = PlayFormState & PlayFormActions;

const PlayFormContext = createContext<PlayFormContextValue | null>(null);

export function PlayFormProvider(props: {
  normalMax: number;
  bonusMax: number;
  children: ReactNode;
}) {
  const { normalMax, bonusMax, children } = props;

  const [quantity, setQuantityState] = useState<number>(MIN_QUANTITY);
  const [picks, setPicks] = useState<Pick[]>(() => [emptyPick()]);
  const [editorIndex, setEditorIndex] = useState<number | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  // Seed unfilled picks with quick-picks after mount only — running
  // Math.random() during initial render would cause SSR/CSR hydration
  // mismatches.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPicks((prev) =>
      prev.map((p) =>
        isPickFilled(p) ? p : { ...quickPick(normalMax, bonusMax), id: p.id }
      )
    );
  }, [normalMax, bonusMax]);

  const setQuantity = useCallback(
    (n: number) => {
      const clamped = Math.max(MIN_QUANTITY, Math.min(MAX_QUANTITY, n));
      setQuantityState(clamped);
      setPicks((prev) => {
        if (prev.length === clamped) return prev;
        if (prev.length < clamped) {
          return [
            ...prev,
            ...Array.from({ length: clamped - prev.length }, () =>
              quickPick(normalMax, bonusMax)
            ),
          ];
        }
        return prev.slice(0, clamped);
      });
    },
    [normalMax, bonusMax]
  );

  const addTicket = useCallback(() => {
    setQuantityState((q) => Math.min(MAX_QUANTITY, q + 1));
    setPicks((prev) => [...prev, quickPick(normalMax, bonusMax)]);
  }, [normalMax, bonusMax]);

  const removeTicket = useCallback((index: number) => {
    setPicks((prev) => {
      if (prev.length <= 1) return prev;
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
    setQuantityState((q) => Math.max(MIN_QUANTITY, q - 1));
  }, []);

  const shuffleTicket = useCallback(
    (index: number) => {
      setPicks((prev) => {
        const existing = prev[index];
        if (!existing) return prev;
        const next = [...prev];
        next[index] = { ...quickPick(normalMax, bonusMax), id: existing.id };
        return next;
      });
    },
    [normalMax, bonusMax]
  );

  const clearTicket = useCallback((index: number) => {
    setPicks((prev) => {
      const existing = prev[index];
      if (!existing) return prev;
      const next = [...prev];
      next[index] = { ...existing, normals: [0, 0, 0, 0, 0], bonus: 0 };
      return next;
    });
  }, []);

  const shuffleAll = useCallback(() => {
    setPicks((prev) =>
      prev.map((p) => ({ ...quickPick(normalMax, bonusMax), id: p.id }))
    );
  }, [normalMax, bonusMax]);

  const clearAll = useCallback(() => {
    setPicks((prev) =>
      prev.map((p) => ({ ...p, normals: [0, 0, 0, 0, 0], bonus: 0 }))
    );
  }, []);

  const setPick = useCallback((index: number, pick: Omit<Pick, "id">) => {
    setPicks((prev) => {
      const existing = prev[index];
      if (!existing) return prev;
      const next = [...prev];
      next[index] = { ...pick, id: existing.id };
      return next;
    });
  }, []);

  const finalizePicks = useCallback(() => {
    return picks.map((p) =>
      isPickFilled(p) ? p : quickPick(normalMax, bonusMax)
    );
  }, [picks, normalMax, bonusMax]);

  const value = useMemo<PlayFormContextValue>(
    () => ({
      quantity,
      picks,
      editorIndex,
      checkoutOpen,
      normalMax,
      bonusMax,
      setQuantity,
      addTicket,
      removeTicket,
      shuffleTicket,
      clearTicket,
      shuffleAll,
      clearAll,
      setPick,
      finalizePicks,
      openEditor: (i) => setEditorIndex(i),
      closeEditor: () => setEditorIndex(null),
      openCheckout: () => setCheckoutOpen(true),
      closeCheckout: () => setCheckoutOpen(false),
    }),
    [
      quantity,
      picks,
      editorIndex,
      checkoutOpen,
      normalMax,
      bonusMax,
      setQuantity,
      addTicket,
      removeTicket,
      shuffleTicket,
      clearTicket,
      shuffleAll,
      clearAll,
      setPick,
      finalizePicks,
    ]
  );

  return (
    <PlayFormContext.Provider value={value}>
      {children}
    </PlayFormContext.Provider>
  );
}

export function usePlayForm(): PlayFormContextValue {
  const ctx = useContext(PlayFormContext);
  if (!ctx) throw new Error("usePlayForm must be used within PlayFormProvider");
  return ctx;
}

export { quickPick, emptyPick };
