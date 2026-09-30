"use client";

import { FloatingCard } from "@/components/floating-card";
import { RoutineIcon } from "@/components/routines/routine-icon";
import { db } from "@/lib/db/schema";
import { type DprContext, dprBadge } from "@/lib/dpr/calls";
import { buildPreWorkoutRows } from "@/lib/workout/pre-workout-preview";
import {
  DEFAULT_SESSION_INTENSITY,
  SESSION_INTENSITIES,
  SESSION_INTENSITY_DESCRIPTIONS,
  SESSION_INTENSITY_LABELS,
  type SessionIntensity,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";

interface Props {
  /** Null for users without DPR: no targets or intensity pick (issue #282). */
  context: DprContext | null;
  routineId: string;
  routineName: string;
  starting: boolean;
  /** Null without DPR: the session records no intensity pick. */
  onStart: (intensity: SessionIntensity | null) => void;
  onCancel: () => void;
}

function formatWeight(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/**
 * Pre-workout sheet (issue #235): the routine's exercises and a Start button.
 * DPR users also get today's targets and "How hard do you want to push
 * today?" — Go light / Maintain / Push — with the targets following the pick
 * before the workout starts. Without DPR it's a plain preview (issue #282).
 */
export function PreWorkoutSheet({
  context,
  routineId,
  routineName,
  starting,
  onStart,
  onCancel,
}: Props) {
  const [intensity, setIntensity] = useState<SessionIntensity>(DEFAULT_SESSION_INTENSITY);
  const routine = useLiveQuery(() => db.routines.get(routineId), [routineId]);
  const items = useLiveQuery(
    () => db.routineExercises.where("routineId").equals(routineId).toArray(),
    [routineId],
  );
  // DPR's context already carries every exercise; without it, look up just
  // this routine's.
  const exercises = useLiveQuery(async () => {
    if (context || !items) return undefined;
    const rows = await db.exercises.bulkGet(items.map((item) => item.exerciseId));
    return new Map(rows.flatMap((row) => (row ? [[row.id, row] as const] : [])));
  }, [context, items]);
  const rows = useMemo(
    () => buildPreWorkoutRows(context, items ?? [], intensity, context?.exercises ?? exercises),
    [context, items, intensity, exercises],
  );
  const units = context?.settings.units;

  return (
    <FloatingCard labelledBy="pre-workout-title" onClose={onCancel} placement="bottom">
      {(requestClose) => (
        <>
          <div className="flex touch-none flex-col gap-1 px-4 pt-4">
            <h2
              id="pre-workout-title"
              className="flex min-w-0 items-center gap-2 text-lg font-semibold"
            >
              {routine && (
                <RoutineIcon
                  shape={routine.iconShape}
                  color={routine.iconColor}
                  className="h-5 w-5"
                />
              )}
              <span className="truncate">{routineName}</span>
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-500">
              {rows.length} exercise{rows.length === 1 ? "" : "s"}
            </p>
          </div>

          <ul className="allow-pwa-select mt-2 flex min-h-0 flex-1 flex-col divide-y divide-zinc-200 overflow-y-auto overscroll-contain px-4 dark:divide-zinc-800">
            {rows.map((row) => {
              const badge = row.dpr ? dprBadge(row.dpr.decision.call) : null;
              const weight = row.dpr?.decision.weight ?? null;
              return (
                <li key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{row.name}</span>
                    {row.plan && (
                      <span className="text-xs text-zinc-500 dark:text-zinc-500">{row.plan}</span>
                    )}
                  </span>
                  {badge && weight !== null && (
                    <span
                      aria-label={`${badge.label}, ${formatWeight(weight)} ${units}`}
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${badge.className}`}
                    >
                      {badge.symbol} {formatWeight(weight)} {units}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="flex touch-none flex-col gap-3 border-t border-zinc-200 px-4 pt-3 pb-4 dark:border-zinc-800">
            {context && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-semibold">
                  How hard do you want to push today?
                </legend>
                <div className="grid grid-cols-3 gap-2">
                  {SESSION_INTENSITIES.map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={intensity === option}
                      onClick={() => setIntensity(option)}
                      className={`min-h-11 rounded-lg border px-2 text-sm font-medium ${
                        intensity === option
                          ? "border-accent bg-accent text-accent-foreground"
                          : "border-zinc-300 dark:border-zinc-700"
                      }`}
                    >
                      {SESSION_INTENSITY_LABELS[option]}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-500">
                  {SESSION_INTENSITY_DESCRIPTIONS[intensity]}
                </p>
              </fieldset>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={requestClose}
                className="min-h-11 flex-1 rounded-lg border border-zinc-300 px-4 text-base font-medium dark:border-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onStart(context ? intensity : null)}
                disabled={starting}
                className="min-h-11 flex-[2] rounded-lg bg-accent px-4 text-base font-medium text-accent-foreground disabled:opacity-50"
              >
                Start workout
              </button>
            </div>
          </div>
        </>
      )}
    </FloatingCard>
  );
}
