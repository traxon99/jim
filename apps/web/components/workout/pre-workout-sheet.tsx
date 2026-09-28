"use client";

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
import { useEffect, useMemo, useState } from "react";

interface Props {
  context: DprContext;
  routineId: string;
  routineName: string;
  starting: boolean;
  onStart: (intensity: SessionIntensity) => void;
  onCancel: () => void;
}

function formatWeight(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/**
 * Pre-workout sheet for DPR users (issue #235): the routine's exercises with
 * today's targets, and "How hard do you want to push today?" — Go light /
 * Maintain / Push. The targets follow the pick before the workout starts.
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
  const rows = useMemo(
    () => buildPreWorkoutRows(context, items ?? [], intensity),
    [context, items, intensity],
  );
  const units = context.settings.units;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  // `fixed` doesn't stop the page underneath from scrolling (docs/PWA.md §2).
  useEffect(() => {
    const html = document.documentElement;
    const { body } = document;
    const previous = { html: html.style.overflow, body: body.style.overflow };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = previous.html;
      body.style.overflow = previous.body;
    };
  }, []);

  return (
    // z-20: a full-screen overlay, above the tab bar and in-flow chrome
    // (docs/PWA.md §4). Only shown from the Workout tab, never alongside
    // FocusView or the exercise picker.
    <div
      className="fixed inset-0 z-20 flex flex-col justify-end overscroll-none bg-black/40"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onCancel}
        className="min-h-0 flex-1 touch-none"
      />
      <section
        aria-labelledby="pre-workout-title"
        className="flex max-h-[85%] min-h-0 flex-col rounded-t-2xl bg-white dark:bg-zinc-950"
      >
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

        <div
          className="flex touch-none flex-col gap-3 border-t border-zinc-200 px-4 pt-3 dark:border-zinc-800"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
        >
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
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="min-h-11 flex-1 rounded-lg border border-zinc-300 px-4 text-base font-medium dark:border-zinc-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onStart(intensity)}
              disabled={starting}
              className="min-h-11 flex-[2] rounded-lg bg-accent px-4 text-base font-medium text-accent-foreground disabled:opacity-50"
            >
              Start workout
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
