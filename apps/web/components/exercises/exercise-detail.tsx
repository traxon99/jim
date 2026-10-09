"use client";

import { BodyMap } from "@/components/exercises/body-map";
import { FloatingCard } from "@/components/floating-card";
import { OneRepMaxChart } from "@/components/history/one-rep-max-chart";
import { RestStatsLine, SetRestTag } from "@/components/workout/rest-stats-line";
import { db } from "@/lib/db/schema";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import {
  PULLEY_LABELS,
  computeCardioBests,
  deletedSessionExerciseIds,
  distanceUnitFor,
  estimatedOneRepMaxSeries,
  exerciseDemo,
  exerciseMuscleShading,
  formatDistance,
  formatDuration,
  formatTimedSet,
  isCardioExercise,
  isWarmupExercise,
  machineName,
  resolveCurrentRows,
  warmupFrequency,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { ExternalLink, MapPin, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo } from "react";

/**
 * `onClose` opens the card in place (e.g. over an active workout, issue
 * #301) instead of as the /exercises/[id] route: closing calls it rather than
 * navigating back to the Exercises tab, and the Edit link is hidden so a tap
 * can't navigate away mid-workout.
 */
/** Workouts shown under "Your history" (issue #333). */
const HISTORY_WORKOUTS = 5;

export function ExerciseDetail({
  id,
  userId,
  onClose,
}: {
  id: string;
  userId: string;
  onClose?: () => void;
}) {
  const router = useRouter();
  const closeToList = onClose ?? (() => router.push("/exercises"));
  const titleId = useId();
  const exercise = useLiveQuery(() => db.exercises.get(id), [id]);
  const settings = useLiveQuery(() => db.settings.get("me"), []) ?? DEFAULT_SETTINGS;
  // The machine's gym (issue #451); a deleted gym reads as none.
  const gym = useLiveQuery(async () => {
    const gymId = exercise?.gymId;
    if (!gymId) return null;
    const row = await db.gyms.get(gymId);
    return row && !row.deletedAt ? row : null;
  }, [exercise?.gymId]);
  const distanceUnit = distanceUnitFor(settings.units);

  // Every current (non-superseded, non-deleted) set logged against this
  // exercise, most recent first, paired with which session it belongs to
  // (estimatedOneRepMaxSeries needs that to plot one point per session).
  // Sets from a deleted workout, or an exercise removed from one, don't
  // count (issue #200).
  const resolvedSets = useLiveQuery(async () => {
    const allSessionExercises = await db.sessionExercises.where("exerciseId").equals(id).toArray();
    const sessions = await db.sessions.bulkGet([
      ...new Set(allSessionExercises.map((se) => se.sessionId)),
    ]);
    const deleted = deletedSessionExerciseIds(
      sessions.filter((session) => session != null),
      allSessionExercises,
    );
    const sessionExercises = allSessionExercises.filter((se) => !deleted.has(se.id));
    if (sessionExercises.length === 0) return [];

    const sessionIdBySessionExerciseId = new Map(
      sessionExercises.map((se) => [se.id, se.sessionId]),
    );
    const allSets = await db.sets
      .where("sessionExerciseId")
      .anyOf(sessionExercises.map((se) => se.id))
      .toArray();

    return resolveCurrentRows(allSets)
      .filter((set) => !set.deletedAt)
      .map((set) => ({
        ...set,
        sessionId: sessionIdBySessionExerciseId.get(set.sessionExerciseId) ?? set.sessionExerciseId,
      }))
      .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
  }, [id]);

  // The last few workouts' sets, grouped under one date each (issue #333)
  // rather than a date repeated on every set; sets in the order they were done.
  const history = useMemo(() => {
    if (!resolvedSets) return undefined;
    const groups: { sessionId: string; date: Date; sets: typeof resolvedSets }[] = [];
    for (const set of resolvedSets) {
      const group = groups.find((candidate) => candidate.sessionId === set.sessionId);
      if (group) group.sets.push(set);
      else if (groups.length < HISTORY_WORKOUTS)
        groups.push({ sessionId: set.sessionId, date: set.completedAt, sets: [set] });
    }
    for (const group of groups) {
      group.sets.sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
    }
    return groups;
  }, [resolvedSets]);

  const oneRepMaxPoints = useMemo(
    () =>
      estimatedOneRepMaxSeries(
        (resolvedSets ?? []).map((set) => ({
          sessionId: set.sessionId,
          completedAt: set.completedAt,
          weight: set.weight == null ? null : Number(set.weight),
          reps: set.reps,
        })),
      ),
    [resolvedSets],
  );

  const frequency = useMemo(() => warmupFrequency(resolvedSets ?? [], new Date()), [resolvedSets]);
  const cardioBests = useMemo(() => computeCardioBests(resolvedSets ?? []), [resolvedSets]);

  if (exercise === undefined) {
    return null;
  }

  if (exercise === null) {
    return (
      <FloatingCard labelledBy={titleId} onClose={closeToList}>
        {(close) => (
          <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
            <h1 id={titleId} className="text-xl font-semibold">
              Exercise not found
            </h1>
            <button
              type="button"
              onClick={close}
              className="min-h-11 rounded-lg border border-zinc-300 px-4 text-base font-medium dark:border-zinc-700"
            >
              {onClose ? "Close" : "Back to exercises"}
            </button>
          </div>
        )}
      </FloatingCard>
    );
  }

  const canEdit = !onClose && (exercise.ownerId === null || exercise.ownerId === userId);
  const isWarmup = isWarmupExercise(exercise);
  const isCardio = isCardioExercise(exercise);
  const tags = [
    isWarmup ? "warm-up" : null,
    isCardio ? "cardio" : null,
    exercise.equipment,
    ...exercise.primaryMuscles,
    ...exercise.secondaryMuscles,
  ].filter((tag): tag is string => Boolean(tag));
  const hasMuscles = exercise.primaryMuscles.length + exercise.secondaryMuscles.length > 0;
  // Rows synced before the column existed have no videoUrl at all.
  const demo = exerciseDemo({ name: exercise.name, videoUrl: exercise.videoUrl ?? null });
  const machine = machineName(exercise);
  const pulley = exercise.pulleyType ? PULLEY_LABELS[exercise.pulleyType] : null;

  return (
    <FloatingCard labelledBy={titleId} onClose={closeToList}>
      {(close) => (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pt-4 pb-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h1 id={titleId} className="text-xl font-semibold">
                  {exercise.name}
                </h1>
                {exercise.isArchived && (
                  <p className="text-xs text-amber-600 dark:text-amber-500">Archived</p>
                )}
              </div>
              {canEdit && (
                <Link
                  href={`/exercises/${exercise.id}/edit`}
                  aria-label="Edit exercise"
                  className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-zinc-500 dark:text-zinc-500"
                >
                  <Pencil className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                </Link>
              )}
            </div>

            {exercise.imageUrls.length > 0 && (
              <div className="flex gap-2 overflow-x-auto">
                {exercise.imageUrls.map((url) => (
                  <img
                    key={url}
                    src={url}
                    alt={exercise.name}
                    className="h-40 w-auto rounded-lg object-cover"
                  />
                ))}
              </div>
            )}

            {hasMuscles && (
              <section>
                <h2 className="text-sm font-semibold">Muscles worked</h2>
                <BodyMap
                  shading={exerciseMuscleShading(exercise)}
                  label={muscleSummary(exercise.primaryMuscles, exercise.secondaryMuscles)}
                  className="mt-2"
                />
                {exercise.secondaryMuscles.length > 0 && (
                  <p className="mt-1 text-center text-xs text-zinc-500 dark:text-zinc-500">
                    Darker: primary · lighter: secondary
                  </p>
                )}
              </section>
            )}

            <a
              href={demo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
            >
              <ExternalLink className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              {demo.custom ? "Watch demo video" : "Find a demo video"}
            </a>

            {(machine || pulley || gym) && (
              <section className="flex flex-col gap-1">
                <h2 className="text-sm font-semibold">Machine</h2>
                {(machine || pulley) && (
                  <p className="allow-pwa-select text-sm text-zinc-700 dark:text-zinc-300">
                    {[machine, pulley].filter(Boolean).join(" · ")}
                  </p>
                )}
                {gym && (
                  <p className="flex min-w-0 items-center gap-1 text-sm text-zinc-600 dark:text-zinc-400">
                    <MapPin className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                    <span className="truncate">At {gym.name}</span>
                  </p>
                )}
              </section>
            )}

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {exercise.instructions.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold">Instructions</h2>
                <ol className="allow-pwa-select mt-1 list-decimal space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
                  {exercise.instructions.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </section>
            )}

            {isWarmup && (
              <section>
                <h2 className="text-sm font-semibold">How often</h2>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                  Warm-ups are tracked by how often you do them, not for PRs.
                </p>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: "Last 30 days", value: String(frequency.recentSessionCount) },
                    { label: "All time", value: String(frequency.sessionCount) },
                    {
                      label: "Last done",
                      value: frequency.lastDoneAt ? frequency.lastDoneAt.toLocaleDateString() : "—",
                    },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-lg bg-zinc-100 px-2 py-2 dark:bg-zinc-900"
                    >
                      <dt className="text-xs text-zinc-500 dark:text-zinc-500">{stat.label}</dt>
                      <dd className="text-base font-semibold tabular-nums">{stat.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {isCardio &&
              (cardioBests.distance != null ||
                cardioBests.durationSeconds != null ||
                cardioBests.paceSeconds != null) && (
                <section>
                  <h2 className="text-sm font-semibold">Records</h2>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                    {[
                      {
                        label: "Longest distance",
                        value:
                          cardioBests.distance != null
                            ? formatDistance(cardioBests.distance, distanceUnit)
                            : "—",
                      },
                      {
                        label: "Longest time",
                        value:
                          cardioBests.durationSeconds != null
                            ? formatDuration(cardioBests.durationSeconds)
                            : "—",
                      },
                      {
                        label: "Fastest pace",
                        value:
                          cardioBests.paceSeconds != null
                            ? `${formatDuration(cardioBests.paceSeconds)} /${distanceUnit}`
                            : "—",
                      },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="min-w-0 rounded-lg bg-zinc-100 px-2 py-2 dark:bg-zinc-900"
                      >
                        <dt className="text-xs text-zinc-500 dark:text-zinc-500">{stat.label}</dt>
                        <dd className="truncate text-base font-semibold tabular-nums">
                          {stat.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}

            {!isWarmup && !isCardio && oneRepMaxPoints.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold">Estimated 1RM over time</h2>
                <div className="mt-2">
                  <OneRepMaxChart points={oneRepMaxPoints} />
                </div>
              </section>
            )}

            <section>
              <h2 className="text-sm font-semibold">Your history</h2>
              {!isWarmup && resolvedSets && <RestStatsLine sets={resolvedSets} className="mt-1" />}
              {!history || history.length === 0 ? (
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">No sets logged yet.</p>
              ) : (
                <div className="allow-pwa-select mt-1 flex flex-col gap-3 text-sm">
                  {history.map((group) => (
                    <section key={group.sessionId} className="flex flex-col">
                      <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-500">
                        {group.date.toLocaleDateString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </h3>
                      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                        {group.sets.map((set) => (
                          <li key={set.id} className="flex justify-between gap-2 py-2">
                            <span className="flex items-center gap-2">
                              <span className="tabular-nums">
                                {set.weight != null && set.reps != null
                                  ? // Numeric columns come back as "195.00" (issue #333).
                                    `${Number(set.weight)} × ${set.reps}`
                                  : set.reps != null
                                    ? `${set.reps} reps`
                                    : (formatTimedSet(set, distanceUnit) ?? "—")}
                              </span>
                              <SetRestTag set={set} />
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="flex touch-none border-t border-zinc-200 px-4 pt-3 pb-4 dark:border-zinc-800">
            <button
              type="button"
              onClick={close}
              className="min-h-11 flex-1 rounded-lg border border-zinc-300 px-4 text-base font-medium dark:border-zinc-700"
            >
              Done
            </button>
          </div>
        </>
      )}
    </FloatingCard>
  );
}

/** "Works chest; also triceps and shoulders", read out for the body map. */
function muscleSummary(primary: readonly string[], secondary: readonly string[]): string {
  const list = (muscles: readonly string[]) =>
    muscles.length <= 1
      ? muscles.join("")
      : `${muscles.slice(0, -1).join(", ")} and ${muscles[muscles.length - 1]}`;
  const parts = [];
  if (primary.length > 0) parts.push(`Works ${list(primary)}`);
  if (secondary.length > 0)
    parts.push(`${primary.length > 0 ? "also" : "Also works"} ${list(secondary)}`);
  return parts.join("; ");
}
