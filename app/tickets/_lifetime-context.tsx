"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type RoundEarnings = {
  /** Total winnings across all winning tickets in this round (claimed + unclaimed). */
  won: bigint;
  /** Subset of `won` that's still unclaimed and has a non-zero per-combo payout. */
  claimable: bigint;
};

type LifetimeCtx = {
  /** Cards register their per-round numbers here so the lifetime totals stay in sync. */
  register: (roundId: string, earnings: RoundEarnings) => void;
  totals: {
    won: bigint;
    claimable: bigint;
    /** Number of past rounds where the user had at least one winning ticket. */
    rounds: number;
  };
};

const LifetimeContext = createContext<LifetimeCtx | null>(null);

export function LifetimeEarningsProvider(props: { children: ReactNode }) {
  const [byRound, setByRound] = useState<Map<string, RoundEarnings>>(
    () => new Map()
  );

  const register = useCallback((roundId: string, earnings: RoundEarnings) => {
    setByRound((prev) => {
      const old = prev.get(roundId);
      if (
        old &&
        old.won === earnings.won &&
        old.claimable === earnings.claimable
      ) {
        return prev;
      }
      const next = new Map(prev);
      next.set(roundId, earnings);
      return next;
    });
  }, []);

  const totals = useMemo(() => {
    let won = 0n;
    let claimable = 0n;
    let rounds = 0;
    for (const e of byRound.values()) {
      if (e.won > 0n) rounds += 1;
      won += e.won;
      claimable += e.claimable;
    }
    return { won, claimable, rounds };
  }, [byRound]);

  const value = useMemo<LifetimeCtx>(
    () => ({ register, totals }),
    [register, totals]
  );

  return (
    <LifetimeContext.Provider value={value}>
      {props.children}
    </LifetimeContext.Provider>
  );
}

export function useLifetimeEarnings(): LifetimeCtx | null {
  return useContext(LifetimeContext);
}
