"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useState } from "react";

import { FloatingCard } from "../floating-card";

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

/** RPE column title, opened into an info card (issues #163, #410) explaining the scale. Purely informational, not a selector. Rendered through FloatingCard, centered over the page, since an anchored popup got clipped at the screen edge (#410). */
export function RpeInfoMenu({ large = false, titleId }: Props) {
  const [open, setOpen] = useState(false);
  const closeOpen = useCallback(() => setOpen(false), []);

  return (
    <div className="relative inline-block text-left">
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
        <FloatingCard labelledBy="rpe-info-heading" onClose={closeOpen}>
          {() => (
            <div className="overflow-y-auto p-4">
              <h2
                id="rpe-info-heading"
                className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
              >
                RPE (Rate of Perceived Exertion)
              </h2>
              <p className="mt-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                How hard a set felt, from 5 to 10 — higher is harder.
              </p>
              <ul className="mt-2 flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-500">
                {RPE_LEVELS.map((level) => (
                  <li key={level.value}>
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                      {level.value}
                    </span>{" "}
                    — {level.description}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </FloatingCard>
      )}
    </div>
  );
}
