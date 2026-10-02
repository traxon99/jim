"use client";

import { LoadingText } from "@/components/loading-text";
import { BackLink } from "@/components/page-header";
import { RoutineIconById } from "@/components/routines/routine-icon-by-id";
import { RestStatsLine, SetRestTag } from "@/components/workout/rest-stats-line";
import { ShareWorkoutButton } from "@/components/workout/share-workout-button";
import { db } from "@/lib/db/schema";
import { buildMuscleVolumeSets } from "@/lib/history/muscle-volume-data";
import { buildSessionDetailExercises } from "@/lib/history/session-detail-entries";
import { deleteSession } from "@/lib/sessions/finalize-session";
import { setKindLabel, setNumberLabels } from "@/lib/sessions/set-kinds";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { buildWorkoutShareText } from "@/lib/workout/share-text";
import { PR_KIND_LABELS } from "@/lib/workout/summary-exercises";
import { deriveUntitledSessionName, resolveCurrentRows, summarizeSession } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export function SessionDetail({ id }: { id: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const settings = useLiveQuery(() => db.settings.get("me"), []) ?? DEFAULT_SETTINGS;
  const session = useLiveQuery(async () => (await db.sessions.get(id)) ?? null, [id]);
  const rawSessionExercises = useLiveQuery(
    () => db.sessionExercises.where("sessionId").equals(id).toArray(),
    [id],
  );
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  const rawSets = useLiveQuery(async () => {
    const sessionExerciseIds = (
      await db.sessionExercises.where("sessionId").equals(id).toArray()
    ).map((se) => se.id);
    if (sessionExerciseIds.length === 0) return [];
    return db.sets.where("sessionExerciseId").anyOf(sessionExerciseIds).toArray();
  }, [id]);
  const rawPersonalRecords = useLiveQuery(() => db.personalRecords.toArray(), []);

  const groups = useMemo(
    () =>
      buildSessionDetailExercises(
        id,
        rawSessionExercises ?? [],
        exercises ?? [],
        rawSets ?? [],
        rawPersonalRecords ?? [],
      ),
    [id, rawSessionExercises, exercises, rawSets, rawPersonalRecords],
  );

  const summary = useMemo(() => {
    if (!session) return null;
    const sets = resolveCurrentRows(rawSets ?? []).filter((set) => !set.deletedAt);
    // A count of achieved PR rows, not distinct sets — mirrors
    // SessionSummary's prCount (S6): one set can beat several PR kinds at once.
    const prCount = groups.reduce(
      (count, group) =>
        count + group.sets.reduce((setCount, set) => setCount + set.prKinds.length, 0),
      0,
    );
    return summarizeSession(
      sets.map((set) => ({
        weight: set.weight == null ? null : Number(set.weight),
        reps: set.reps,
      })),
      session.startedAt,
      session.endedAt ?? new Date(),
      prCount,
    );
  }, [session, rawSets, groups]);

  const displayName = useMemo(() => {
    if (!session) return null;
    if (session.name) return session.name;
    const muscleVolumeSets = buildMuscleVolumeSets(
      [session],
      rawSessionExercises ?? [],
      exercises ?? [],
      rawSets ?? [],
    );
    return deriveUntitledSessionName(session.startedAt, muscleVolumeSets);
  }, [session, rawSessionExercises, exercises, rawSets]);

  const shareText = useMemo(
    () =>
      session && summary
        ? buildWorkoutShareText({
            name: displayName,
            startedAt: session.startedAt,
            units: settings.units,
            summary,
            exercises: groups,
          })
        : null,
    [session, summary, displayName, settings.units, groups],
  );

  if (session === undefined) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <LoadingText />
      </main>
    );
  }

  if (session === null || session.deletedAt) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-xl font-semibold">Workout not found</h1>
        <Link href="/history" className="text-sm font-medium underline underline-offset-4">
          Back to history
        </Link>
      </main>
    );
  }

  async function handleDelete() {
    if (!session) return;
    if (!confirm("Delete this workout? This can't be undone.")) return;
    setDeleting(true);
    try {
      await deleteSession(session);
      router.push("/history");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-4 px-4 py-4">
      <div className="self-start">
        <BackLink href="/history" label="History" />
      </div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <RoutineIconById routineId={session.routineId} className="h-5 w-5" />
            {displayName}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-500">
            {/* "Mon, Sep 28 · 5:30 PM" rather than toLocaleString's seconds (issue #333). */}
            {session.startedAt.toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}{" "}
            ·{" "}
            {session.startedAt.toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>
        {session.endedAt && shareText && (
          <ShareWorkoutButton
            title={displayName ?? "Workout"}
            text={shareText}
            className="min-h-11 shrink-0 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-950 dark:border-zinc-700 dark:text-zinc-50"
          />
        )}
      </div>

      {summary && (
        <dl className="grid grid-cols-4 gap-2 text-center">
          <div>
            <dt className="text-xs text-zinc-500 dark:text-zinc-500">Duration</dt>
            <dd className="text-lg font-semibold">
              {Math.round(summary.durationSeconds / 60)} min
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500 dark:text-zinc-500">Volume</dt>
            <dd className="text-lg font-semibold">
              {Math.round(summary.totalVolume).toLocaleString()} {settings.units}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500 dark:text-zinc-500">Sets</dt>
            <dd className="text-lg font-semibold">{summary.setCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500 dark:text-zinc-500">PRs</dt>
            <dd className="text-lg font-semibold">{summary.prCount}</dd>
          </div>
        </dl>
      )}

      <RestStatsLine sets={groups.flatMap((group) => group.sets)} />

      {session.notes && <p className="text-sm text-zinc-700 dark:text-zinc-300">{session.notes}</p>}

      <div className="flex flex-col gap-5">
        {groups
          .map((entry) => ({
            ...entry,
            setLabels: setNumberLabels(entry.sets.map((set) => set.kind)),
          }))
          .map((group) => (
            <section key={group.sessionExerciseId} className="flex flex-col gap-1">
              <Link
                href={`/exercises/${group.exerciseId}`}
                className="text-base font-semibold underline-offset-4 hover:underline"
              >
                {group.exerciseName}
              </Link>
              {group.notes && (
                <p className="text-xs text-zinc-500 dark:text-zinc-500">{group.notes}</p>
              )}
              <ul className="allow-pwa-select flex flex-col divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                {group.sets.map((set, i) => (
                  <li key={set.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="flex items-center gap-2">
                      {set.kind === "warmup" ? (
                        <span
                          aria-label="Warm-up set"
                          className="font-bold text-amber-500 dark:text-amber-400"
                        >
                          W
                        </span>
                      ) : (
                        <span className="text-zinc-500 dark:text-zinc-500">
                          #{group.setLabels[i]}
                        </span>
                      )}
                      <span>
                        {set.weight != null && set.reps != null
                          ? `${set.weight} × ${set.reps}`
                          : set.reps != null
                            ? `${set.reps} reps`
                            : set.durationSeconds != null
                              ? `${set.durationSeconds}s`
                              : set.distance != null
                                ? `${set.distance}`
                                : "—"}
                      </span>
                      {set.kind !== "working" && set.kind !== "warmup" && (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                          {setKindLabel(set.kind)}
                        </span>
                      )}
                      <SetRestTag set={set} />
                    </span>
                    {set.prKinds.length > 0 && (
                      <span className="flex gap-1">
                        {set.prKinds.map((kind) => (
                          <span
                            key={kind}
                            className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-400"
                          >
                            PR · {PR_KIND_LABELS[kind] ?? kind}
                          </span>
                        ))}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>

      <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="min-h-11 w-full rounded-lg border border-red-300 px-4 py-3 text-base font-medium text-red-600 disabled:opacity-50 dark:border-red-900 dark:text-red-500"
        >
          {deleting ? "Deleting…" : "Delete workout"}
        </button>
      </div>
    </main>
  );
}
