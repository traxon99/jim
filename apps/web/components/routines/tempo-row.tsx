"use client";

import { ChevronRight, Timer } from "@/components/icons/solar";
import { useTempoGroups } from "@/lib/routines/tempo-groups";
import { sharedTempo } from "@jim/core";
import { useCallback, useState } from "react";
import { TempoSheet } from "./tempo-sheet";

/**
 * The Tempo row on a routine or program (issue #850): its lifts' tempo at a
 * glance, opening the Tempo sheet where each lift's is set. Nothing shows
 * while there's no lift to give a tempo to. The caller checks the Advanced
 * Tempo switch.
 */
export function TempoRow({
  title,
  routineIds,
  showRoutineNames = false,
}: {
  title: string;
  routineIds: readonly string[];
  showRoutineNames?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const groups = useTempoGroups(routineIds);
  if (!groups || groups.length === 0) return null;

  const shared = sharedTempo(groups.flatMap((group) => group.lifts.map((lift) => lift.item.tempo)));
  const value = shared.kind === "same" ? shared.tempo : shared.kind === "mixed" ? "Mixed" : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-left text-sm dark:border-zinc-800"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Timer
            className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span className="font-medium">Tempo</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-zinc-500 dark:text-zinc-500">
          {value}
          <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </span>
      </button>
      {open && (
        <TempoSheet
          title={title}
          groups={groups}
          showRoutineNames={showRoutineNames}
          onClose={close}
        />
      )}
    </>
  );
}
