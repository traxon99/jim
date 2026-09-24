"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const RPE_LEVELS = [
  { value: 10, description: "Max effort — no reps left" },
  { value: 9, description: "Very hard — 1 rep left" },
  { value: 8, description: "Hard — 2 reps left" },
  { value: 7, description: "Moderate — 3 reps left" },
  { value: 6, description: "Comfortable — 4+ reps left" },
  { value: 5, description: "Light — plenty left" },
] as const;

interface Props {
  large?: boolean;
  titleId?: string;
}

/** RPE column title, opened into an info menu (issue #163) explaining the scale — mirrors SetKindMenu's open/close behavior but is purely informational, not a selector. */
export function RpeInfoMenu({ large = false, titleId }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block text-left">
      <button
        id={titleId}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className={
          large
            ? "flex items-center gap-1 text-sm font-medium text-zinc-500 dark:text-zinc-400"
            : "flex items-center gap-0.5 font-medium text-zinc-500 dark:text-zinc-500"
        }
      >
        RPE
        <ChevronDown
          className={large ? "h-3.5 w-3.5" : "h-3 w-3"}
          strokeWidth={2}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 w-64 rounded-md border border-zinc-200 bg-white p-3 text-left shadow-md dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            RPE (Rate of Perceived Exertion): how hard a set felt, from 5 to 10 — higher is harder.
          </p>
          <ul className="mt-1.5 flex flex-col gap-0.5 text-xs text-zinc-500 dark:text-zinc-500">
            {RPE_LEVELS.map((level) => (
              <li key={level.value}>
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{level.value}</span>{" "}
                — {level.description}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
