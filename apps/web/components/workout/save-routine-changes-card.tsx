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
 * removed, replaced or reordered, supersets or rests changed), the summary
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
      className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-zinc-300 p-4 text-left dark:border-zinc-700"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-sm font-semibold">Update {comparison.routine.name}?</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          You changed this workout. Save the changes to the routine for next time?
        </p>
      </div>
      <ul className="flex flex-col gap-1 text-sm break-words">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={state === "saving"}
          className="min-h-11 flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60"
        >
          {state === "saving" ? "Saving…" : "Update routine"}
        </button>
        <button
          type="button"
          onClick={() => setState("kept")}
          disabled={state === "saving"}
          className="min-h-11 flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-950 dark:border-zinc-700 dark:text-zinc-50"
        >
          Keep as is
        </button>
      </div>
    </section>
  );
}
