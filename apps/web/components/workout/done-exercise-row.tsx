"use client";

import { Check } from "@/components/icons/solar";

/**
 * A finished exercise folded to one line in the workout list (#854): its
 * name, what was logged, and a filled ✓. Tapping it opens the full table
 * again, so a set can still be fixed.
 */
export function DoneExerciseRow({
  name,
  summary,
  onOpen,
}: {
  name: string;
  summary: string | null;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${name}, done. Show sets`}
      className="surface press flex min-h-16 w-full items-center gap-3 rounded-3xl px-4 py-3 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold">{name}</span>
        {summary && (
          <span className="block truncate text-sm tabular-nums text-zinc-500 dark:text-zinc-500">
            {summary}
          </span>
        )}
      </span>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
      </span>
    </button>
  );
}
