"use client";

import { useState, useRef, useEffect } from "react";
import { useRounds } from "../lib/lottery/accounts";

export function RoundSelect({
  selected,
  onSelect,
}: {
  selected?: string | undefined;
  onSelect: (id?: string) => void;
}) {
  const rounds = useRounds();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex cursor-pointer items-center gap-2 rounded-lg border border-border-low bg-card px-3 py-1 text-xs font-medium"
      >
        {selected ? `#${selected}` : "Current"}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-40 rounded-xl border border-border-low bg-card p-2 shadow-lg">
          <div className="space-y-1">
            <button
              onClick={() => {
                onSelect(undefined);
                setIsOpen(false);
              }}
              className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition hover:bg-cream ${
                !selected ? "bg-cream" : ""
              }`}
            >
              Current
            </button>
            {rounds.ids.map((id) => (
              <button
                key={id.toString()}
                onClick={() => {
                  onSelect(id.toString());
                  setIsOpen(false);
                }}
                className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition hover:bg-cream ${
                  selected === id.toString() ? "bg-cream" : ""
                }`}
              >
                {`#${id.toString()}`}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
