"use client";

import { formatTooltipDate } from "@/components/charts/chart-tooltip";
import { FloatingCard } from "@/components/floating-card";
import { formatSetLine } from "@/lib/charts/chart-hover";
import type { PortalWorkout } from "@/lib/portal/analysis-data";
import { isStandalone } from "@/lib/pwa/standalone";
import type { AnalysisSet } from "@jim/core";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";

/** The set a chart point was drawn from, marked in the workout's list. */
export interface HighlightedSet {
  exerciseId: string;
  weight: number;
  reps: number;
}

interface Props {
  /** One workout opens straight to it; several (a week's bar) list first. */
  sessionIds: readonly string[];
  /** Shown above the list when there are several workouts, e.g. "Week of Mar 2". */
  listHeading?: string;
  highlight?: HighlightedSet;
  sets: readonly AnalysisSet[];
  exerciseNames: ReadonlyMap<string, string>;
  workouts: ReadonlyMap<string, PortalWorkout>;
  units: string;
  onClose: () => void;
}

function workoutTitle(workouts: ReadonlyMap<string, PortalWorkout>, id: string): string {
  return workouts.get(id)?.title ?? "Workout";
}

function workoutDate(
  workouts: ReadonlyMap<string, PortalWorkout>,
  sets: readonly AnalysisSet[],
  id: string,
): Date | undefined {
  const startedAt = workouts.get(id)?.startedAt;
  if (startedAt) return new Date(startedAt);
  return sets.find((set) => set.sessionId === id)?.completedAt;
}

/**
 * The workout a tapped chart point refers to (issue #468), built from the
 * portal's own read-only data so it works in a desktop browser, where the
 * install gate keeps History's workout screen out of reach. Shows working
 * sets only, the same sets the charts count (LESSONS: count working sets).
 * It links to the full workout page in Analysis (issue #470) and, in the
 * installed app, to the same workout in History.
 */
export function PortalWorkoutCard({
  sessionIds,
  listHeading,
  highlight,
  sets,
  exerciseNames,
  workouts,
  units,
  onClose,
}: Props) {
  const titleId = useId();
  const [selectedId, setSelectedId] = useState<string | null>(
    sessionIds.length === 1 ? (sessionIds[0] ?? null) : null,
  );
  // History's workout screen lives behind the install gate, so only offer
  // it where it opens: inside the installed app.
  const [standalone, setStandalone] = useState(false);
  useEffect(() => setStandalone(isStandalone()), []);

  const listed = useMemo(
    () =>
      [...sessionIds].sort(
        (a, b) =>
          (workoutDate(workouts, sets, a)?.getTime() ?? 0) -
          (workoutDate(workouts, sets, b)?.getTime() ?? 0),
      ),
    [sessionIds, workouts, sets],
  );

  const exercisesInWorkout = useMemo(() => {
    if (!selectedId) return [];
    const groups = new Map<string, AnalysisSet[]>();
    const sessionSets = sets
      .filter((set) => set.sessionId === selectedId)
      .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
    for (const set of sessionSets) {
      const group = groups.get(set.exerciseId) ?? [];
      group.push(set);
      groups.set(set.exerciseId, group);
    }
    return [...groups.entries()];
  }, [sets, selectedId]);

  const setCount = (id: string) => sets.filter((set) => set.sessionId === id).length;

  return (
    <FloatingCard labelledBy={titleId} onClose={onClose}>
      {(close) => (
        <>
          <div className="flex touch-none items-start gap-2 px-4 pt-4">
            {selectedId && sessionIds.length > 1 && (
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="Back to the week's workouts"
                className="-ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 dark:text-zinc-400"
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
              </button>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <h2 id={titleId} className="truncate text-lg font-semibold">
                {selectedId ? workoutTitle(workouts, selectedId) : (listHeading ?? "Workouts")}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-500">
                {selectedId
                  ? (() => {
                      const date = workoutDate(workouts, sets, selectedId);
                      return date
                        ? `${formatTooltipDate(date)} · ${date.toLocaleTimeString(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          })}`
                        : "";
                    })()
                  : `${listed.length} workout${listed.length === 1 ? "" : "s"}`}
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 dark:text-zinc-400"
            >
              <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>

          {selectedId ? (
            <div className="allow-pwa-select mt-2 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-4">
              {exercisesInWorkout.map(([exerciseId, exerciseSets]) => {
                // Mark only the first matching set: a 5×5 at one weight would
                // otherwise light up all five.
                const markedIndex =
                  highlight?.exerciseId === exerciseId
                    ? exerciseSets.findIndex(
                        (set) => set.weight === highlight.weight && set.reps === highlight.reps,
                      )
                    : -1;
                return (
                  <section key={exerciseId} className="flex min-w-0 flex-col gap-1">
                    <h3 className="truncate text-sm font-semibold">
                      {exerciseNames.get(exerciseId) ?? "Unknown exercise"}
                    </h3>
                    <ol className="flex flex-col text-sm">
                      {exerciseSets.map((set, index) => {
                        const marked = index === markedIndex;
                        return (
                          <li
                            key={`${set.completedAt.getTime()}-${index}`}
                            className={`flex items-center justify-between gap-3 rounded-md px-2 py-1 tabular-nums ${
                              marked ? "bg-accent text-accent-foreground" : ""
                            }`}
                          >
                            <span className={marked ? "" : "text-zinc-500 dark:text-zinc-500"}>
                              Set {index + 1}
                            </span>
                            <span>
                              {set.weight != null && set.reps != null
                                ? formatSetLine(set.weight, set.reps, units)
                                : set.reps != null
                                  ? `${set.reps} reps`
                                  : "—"}
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                );
              })}
              <p className="text-xs text-zinc-500 dark:text-zinc-500">
                Working sets only
                {highlight ? ". The highlighted set is the one on the chart." : "."}
              </p>
              <Link
                href={`/portal/workouts/${selectedId}`}
                className="flex min-h-11 items-center justify-center rounded-lg border border-zinc-200 text-sm font-medium dark:border-zinc-800"
              >
                Open full workout
              </Link>
              {standalone && (
                <Link
                  href={`/history/${selectedId}`}
                  className="flex min-h-11 items-center justify-center rounded-lg border border-zinc-200 text-sm font-medium dark:border-zinc-800"
                >
                  Open in History
                </Link>
              )}
            </div>
          ) : (
            <ul className="mt-2 flex min-h-0 flex-1 flex-col divide-y divide-zinc-200 overflow-y-auto overscroll-contain px-4 pb-2 dark:divide-zinc-800">
              {listed.map((id) => {
                const date = workoutDate(workouts, sets, id);
                const count = setCount(id);
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(id)}
                      className="flex w-full min-w-0 items-center gap-3 py-3 text-left"
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">
                          {workoutTitle(workouts, id)}
                        </span>
                        <span className="text-xs text-zinc-500 dark:text-zinc-500">
                          {date ? formatTooltipDate(date) : ""} · {count} set
                          {count === 1 ? "" : "s"}
                        </span>
                      </span>
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-zinc-400"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </FloatingCard>
  );
}
