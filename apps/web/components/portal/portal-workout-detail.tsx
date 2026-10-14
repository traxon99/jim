"use client";

import { SessionSetRow } from "@/components/history/session-set-row";
import { RestStatsLine } from "@/components/workout/rest-stats-line";
import { formatMinutes } from "@/lib/home/stats";
import type { PortalWorkoutDetail } from "@/lib/portal/workouts-data";
import { isStandalone } from "@/lib/pwa/standalone";
import { setNumberLabels } from "@/lib/sessions/set-kinds";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useIsClient } from "./use-is-client";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <dt className="text-xs text-zinc-500 dark:text-zinc-500">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * One workout in full on desktop (issue #470), like the phone's workout
 * screen (`SessionDetail`) but read-only: notes, warm-ups, set kinds, RPE,
 * rest, supersets and PRs. In the installed app it also links to the same
 * workout in History.
 */
export function PortalWorkoutDetailView({
  workout,
  units,
}: {
  workout: PortalWorkoutDetail;
  units: "lb" | "kg";
}) {
  const isClient = useIsClient();
  // History's workout screen lives behind the install gate, so only offer it
  // where it opens: inside the installed app.
  const [standalone, setStandalone] = useState(false);
  useEffect(() => setStandalone(isStandalone()), []);
  const startedAt = new Date(workout.startedAt);

  return (
    <div className="route-fade flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/portal/workouts"
          className="flex items-center gap-1 self-start text-sm font-medium text-zinc-500 dark:text-zinc-500"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Workouts
        </Link>
        <h1 className="text-2xl font-semibold break-words">{workout.name}</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          {isClient &&
            `${startedAt.toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            })} · ${startedAt.toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
            })}`}
          {workout.gymName && ` · ${workout.gymName}`}
          {!workout.endedAt && " · In progress"}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Duration" value={formatMinutes(workout.durationSeconds / 60)} />
        <Stat
          label={`Volume (${units})`}
          value={Math.round(workout.totalVolume).toLocaleString()}
        />
        <Stat label="Sets" value={workout.setCount.toLocaleString()} />
        <Stat label="PRs" value={workout.prCount.toLocaleString()} />
      </dl>

      <RestStatsLine sets={workout.exercises.flatMap((exercise) => exercise.sets)} />

      {workout.notes && (
        <p className="allow-pwa-select whitespace-pre-line text-sm text-zinc-700 dark:text-zinc-300">
          {workout.notes}
        </p>
      )}

      <div className="flex flex-col gap-6">
        {workout.exercises.map((exercise) => {
          const labels = setNumberLabels(exercise.sets.map((set) => set.kind));
          return (
            <section key={exercise.sessionExerciseId} className="flex min-w-0 flex-col gap-1">
              <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold">
                {exercise.supersetLabel && (
                  <span
                    className="shrink-0 rounded-md bg-accent px-1.5 py-0.5 text-xs font-semibold text-accent-foreground"
                    aria-label={`Superset ${exercise.supersetLabel}`}
                  >
                    {exercise.supersetLabel}
                  </span>
                )}
                <span className="min-w-0 break-words">{exercise.exerciseName}</span>
              </h2>
              {exercise.notes && (
                <p className="allow-pwa-select text-xs text-zinc-500 dark:text-zinc-500">
                  {exercise.notes}
                </p>
              )}
              {exercise.sets.length === 0 ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-500">No sets logged.</p>
              ) : (
                <ul className="allow-pwa-select flex flex-col divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                  {exercise.sets.map((set, index) => (
                    <SessionSetRow
                      key={set.id}
                      set={set}
                      label={labels[index] ?? ""}
                      units={units}
                      showRpe
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {standalone && (
        <Link
          href={`/history/${workout.id}`}
          className="flex min-h-11 items-center justify-center rounded-lg border border-zinc-200 text-sm font-medium md:self-start md:px-6 dark:border-zinc-800"
        >
          Open in History
        </Link>
      )}
    </div>
  );
}
