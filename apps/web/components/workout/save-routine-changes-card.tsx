"use client";

import { type SessionRow, db } from "@/lib/db/schema";
import {
  compareSessionToRoutine,
  describeRoutineChanges,
  saveSessionChangesToRoutine,
} from "@/lib/routines/session-changes";
import { exerciseDisplayName } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";

/**
 * Issue #407: when a workout strayed from its routine (exercises added,
 * removed, replaced or reordered, supersets, rests or tempos changed), the summary
 * asks whether to save that into the routine for next time. Nothing shows
 * when the workout followed the routine.
 */
export function SaveRoutineChangesCard({ session }: { session: SessionRow }) {
  const [state, setState] = useState<"asking" | "saving" | "saved" | "kept">("asking");
  const comparison = useLiveQuery(
    () => compareSessionToRoutine(session),
    [session.id, session.routineId, session.endedAt],
  );
  const exerciseIds = useMemo(
    () =>
      comparison
        ? [
            ...comparison.changes.added,
            ...comparison.changes.removed,
            ...comparison.changes.restChanged,
            ...comparison.changes.tempoChanged,
          ]
        : [],
    [comparison],
  );
  const exercises = useLiveQuery(() => db.exercises.bulkGet(exerciseIds), [exerciseIds.join(",")]);

  if (state === "saved") {
    return (
      <output className="text-sm text-zinc-600 dark:text-zinc-400">
        Routine updated for next time.
      </output>
    );
  }
  if (state === "kept") return null;
  // Saving rewrites the routine, so the comparison goes away mid-save.
  if (!comparison) {
    return state === "saving" ? (
      <output className="text-sm text-zinc-600 dark:text-zinc-400">Saving…</output>
    ) : null;
  }

  const nameById = new Map(
    (exercises ?? []).flatMap((e) => (e ? [[e.id, exerciseDisplayName(e)]] : [])),
  );
  const lines = describeRoutineChanges(
    comparison.changes,
    (exerciseId) => nameById.get(exerciseId) ?? "an exercise",
  );

  async function handleSave() {
    if (!comparison) return;
    setState("saving");
    try {
      await saveSessionChangesToRoutine(session.userId, comparison);
      setState("saved");
    } catch {
      // Nothing was saved for sure; let the button be tapped again.
      setState("asking");
    }
  }

  return (
    <section
      aria-label="Save changes to routine"
      className="surface flex w-full flex-col gap-3 p-4 text-left"
    >
      <h2 className="min-w-0 font-semibold">Update {comparison.routine.name}?</h2>
      <ul className="flex flex-col gap-1 text-sm break-words text-zinc-600 dark:text-zinc-400">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={state === "saving"}
          className="press min-h-11 flex-1 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-60"
        >
          {state === "saving" ? "Saving…" : "Update routine"}
        </button>
        <button
          type="button"
          onClick={() => setState("kept")}
          disabled={state === "saving"}
          className="press min-h-11 flex-1 rounded-full bg-zinc-900/[0.07] px-4 py-2 text-sm font-semibold dark:bg-white/[0.12]"
        >
          Keep as is
        </button>
      </div>
    </section>
  );
}
