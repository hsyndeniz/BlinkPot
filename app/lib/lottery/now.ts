"use client";

import { useEffect, useState } from "react";

/** Ticking unix-seconds clock for countdown displays. Re-renders once per second. */
export function useNowSeconds(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}
