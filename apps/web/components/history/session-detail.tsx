"use client";

import { SessionSetRow } from "@/components/history/session-set-row";
import { BookmarkPlus } from "@/components/icons/solar";
import { LoadingText } from "@/components/loading-text";
import { PAGE_BODY, PageHeader } from "@/components/page-header";
import { RoutineIconById } from "@/components/routines/routine-icon-by-id";
import { ShareImageButton } from "@/components/share-card/share-image-button";
import { keepOneOff } from "@/components/workout/one-off-cards";
import { RestStatsLine, WorkStatsLine } from "@/components/workout/rest-stats-line";
import { ShareWorkoutButton } from "@/components/workout/share-workout-button";
import { StravaPostRow } from "@/components/workout/strava-post-row";
import { db } from "@/lib/db/schema";
import { buildMuscleVolumeSets } from "@/lib/history/muscle-volume-data";
import { buildSessionDetailExercises } from "@/lib/history/session-detail-entries";
import { exerciseCardHref } from "@/lib/navigation/exercise-card";
import { deleteSession } from "@/lib/sessions/finalize-session";
import { setNumberLabels } from "@/lib/sessions/set-kinds";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { showsRestStats, showsRpe, showsSetTimer } from "@/lib/settings/features";
import { type CardExtras, workoutCardInput } from "@/lib/share-card/build";
import { useStravaActivities, useStravaConnection } from "@/lib/strava/use-strava";
import { buildWorkoutShareText } from "@/lib/workout/share-text";
import {
  deriveUntitledSessionName,
  resolveCurrentRows,
  stravaActivityUrl,
  summarizeSession,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

export function SessionDetail({ id }: { id: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  // A posted workout can't be deleted from Strava by Jim, so deleting it asks first (issue #836).
  const [askingAboutStrava, setAskingAboutStrava] = useState(false);
  const stravaConnection = useStravaConnection().load;
  const { activities: stravaActivities } = useStravaActivities(
    [id],
    stravaConnection.status === "ready" && stravaConnection.connected,
  );
  const stravaActivityId =
    stravaActivities?.[id]?.status === "posted" ? (stravaActivities[id]?.activityId ?? null) : null;
  const settings = useLiveQuery(() => db.settings.get("me"), []) ?? DEFAULT_SETTINGS;
  const session = useLiveQuery(async () => (await db.sessions.get(id)) ?? null, [id]);
  // The one-off this workout came from, while it's still around to keep (#798).
  const oneOff = useLiveQuery(async () => {
    const routineId = session?.routineId;
    const routine = routineId ? await db.routines.get(routineId) : undefined;
    return routine?.oneOff && !routine.deletedAt ? routine : null;
  }, [session?.routineId]);
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
        kind: set.kind,
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

  const buildWorkoutCard = useCallback(
    (extras: CardExtras) => ({
      kind: "workout" as const,
      input: workoutCardInput(
        {
          name: displayName,
          startedAt: session?.startedAt ?? new Date(0),
          endedAt: session?.endedAt ?? null,
          units: settings.units,
          groups,
        },
        extras,
      ),
    }),
    [displayName, session?.startedAt, session?.endedAt, settings.units, groups],
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
    if (stravaActivityId && !askingAboutStrava) {
      setAskingAboutStrava(true);
      return;
    }
    if (!stravaActivityId && !confirm("Delete this workout? This can't be undone.")) return;
    setDeleting(true);
    try {
      await deleteSession(session);
      router.push("/history");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader title={displayName ?? "Workout"} back={{ href: "/history", label: "History" }} />
      <div className={PAGE_BODY}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-500">
              <RoutineIconById routineId={session.routineId} className="h-4 w-4" />
              <span>
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
              </span>
            </p>
          </div>
          {oneOff && (
            // Keep the one-off this workout came from (issue #798).
            <button
              type="button"
              onClick={() => void keepOneOff(oneOff)}
              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-950 dark:border-zinc-700 dark:text-zinc-50"
            >
              <BookmarkPlus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              Save as routine
            </button>
          )}
          {session.endedAt && shareText && (
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              <ShareWorkoutButton
                title={displayName ?? "Workout"}
                text={shareText}
                className="min-h-11 shrink-0 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-950 dark:border-zinc-700 dark:text-zinc-50"
              />
              <ShareImageButton
                build={buildWorkoutCard}
                title={displayName ?? "Workout"}
                text={shareText}
                routineId={session.routineId}
                on={session.startedAt}
                className="min-h-11 shrink-0 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-950 dark:border-zinc-700 dark:text-zinc-50"
              />
            </div>
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

        {showsRestStats(settings) && <RestStatsLine sets={groups.flatMap((group) => group.sets)} />}
        {showsSetTimer(settings) && <WorkStatsLine sets={groups.flatMap((group) => group.sets)} />}

        {session.notes && (
          <p className="text-sm text-zinc-700 dark:text-zinc-300">{session.notes}</p>
        )}

        <div className="flex flex-col gap-5">
          {groups
            .map((entry) => ({
              ...entry,
              setLabels: setNumberLabels(entry.sets.map((set) => set.kind)),
            }))
            .map((group) => (
              <section key={group.sessionExerciseId} className="flex flex-col gap-1">
                <Link
                  href={exerciseCardHref(group.exerciseId, `/history/${id}`)}
                  className="text-base font-semibold underline-offset-4 hover:underline"
                >
                  {group.exerciseName}
                </Link>
                {group.notes && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-500">{group.notes}</p>
                )}
                <ul className="allow-pwa-select flex flex-col divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                  {group.sets.map((set, i) => (
                    <SessionSetRow
                      key={set.id}
                      set={set}
                      label={group.setLabels[i] ?? ""}
                      units={settings.units}
                      showRpe={showsRpe(settings)}
                      showRest={showsRestStats(settings)}
                      showWork={showsSetTimer(settings)}
                    />
                  ))}
                </ul>
              </section>
            ))}
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          {session.endedAt && <StravaPostRow session={session} mode="history" />}
          {askingAboutStrava && stravaActivityId && (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-lg border border-zinc-300 p-3 text-sm dark:border-zinc-700"
            >
              <p>
                This workout is on Strava. Deleting it here leaves it there; remove it on Strava
                too.
              </p>
              <a
                href={stravaActivityUrl(stravaActivityId)}
                target="_blank"
                rel="noopener noreferrer"
                data-ripple
                className="flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 px-4 py-2 font-medium dark:border-zinc-700"
              >
                Open on Strava
              </a>
              <button
                type="button"
                onClick={() => setAskingAboutStrava(false)}
                className="min-h-11 rounded-lg px-4 py-2 font-medium"
              >
                Cancel
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="min-h-11 w-full rounded-lg border border-red-300 px-4 py-3 text-base font-medium text-red-600 disabled:opacity-50 dark:border-red-900 dark:text-red-500"
          >
            {deleting ? "Deleting…" : askingAboutStrava ? "Delete anyway" : "Delete workout"}
          </button>
        </div>
      </div>
    </main>
  );
}
