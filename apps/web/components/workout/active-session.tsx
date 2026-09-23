"use client";

import { ExercisePicker } from "@/components/exercise-picker";
import { primeRestAlertAudio } from "@/lib/audio/rest-alert";
import { mutate } from "@/lib/db/mutate";
import { type ExerciseRow, type RoutineExerciseRow, type SetRow, db } from "@/lib/db/schema";
import { cancelSession, finalizeSession } from "@/lib/sessions/finalize-session";
import { useRestTimer } from "@/lib/sessions/use-rest-timer";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { getDeviceId } from "@/lib/sync/engine";
import { useWakeLock } from "@/lib/wake-lock";
import {
  type PaceExercise,
  resolveCurrentRows,
  resolveFocusedExerciseIndex,
  uuidv7,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { PaceTracker } from "./pace-tracker";
import { RestTimerBar } from "./rest-timer-bar";
import { SessionExerciseSection } from "./session-exercise-section";
import { SessionSummary } from "./session-summary";

export function ActiveSession({ id, userId }: { id: string; userId: string }) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const session = useLiveQuery(async () => (await db.sessions.get(id)) ?? null, [id]);
  const rawSessionExercises = useLiveQuery(
    () => db.sessionExercises.where("sessionId").equals(id).toArray(),
    [id],
  );
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  const rawRoutineExercises = useLiveQuery(
    () =>
      session?.routineId
        ? db.routineExercises.where("routineId").equals(session.routineId).toArray()
        : Promise.resolve<RoutineExerciseRow[]>([]),
    [session?.routineId],
  );
  const settings = useLiveQuery(() => db.settings.get("me"), []) ?? DEFAULT_SETTINGS;

  const restTimer = useRestTimer(id);
  const isActive = session != null && !session.endedAt && !session.deletedAt;
  useWakeLock(isActive);

  const sessionExercises = useMemo(
    () =>
      (rawSessionExercises ?? [])
        .filter((se) => !se.deletedAt)
        .sort((a, b) => a.position - b.position),
    [rawSessionExercises],
  );

  const exerciseById = useMemo(() => {
    const map = new Map<string, ExerciseRow>();
    for (const exercise of exercises ?? []) map.set(exercise.id, exercise);
    return map;
  }, [exercises]);

  const targetByExerciseId = useMemo(() => {
    const map = new Map<string, RoutineExerciseRow>();
    for (const item of rawRoutineExercises ?? []) {
      if (!item.deletedAt) map.set(item.exerciseId, item);
    }
    return map;
  }, [rawRoutineExercises]);

  const sessionExerciseIds = useMemo(() => sessionExercises.map((se) => se.id), [sessionExercises]);
  const idsKey = sessionExerciseIds.join(",");
  const rawSets = useLiveQuery(
    () =>
      sessionExerciseIds.length > 0
        ? db.sets.where("sessionExerciseId").anyOf(sessionExerciseIds).toArray()
        : Promise.resolve<SetRow[]>([]),
    [idsKey],
  );

  const setCompletedAtBySessionExerciseId = useMemo(() => {
    const map = new Map<string, Date[]>();
    for (const set of resolveCurrentRows(rawSets ?? []).filter((s) => !s.deletedAt)) {
      const times = map.get(set.sessionExerciseId) ?? [];
      times.push(set.completedAt);
      map.set(set.sessionExerciseId, times);
    }
    return map;
  }, [rawSets]);

  const focusCandidates = useMemo(
    () =>
      sessionExercises.map((se) => ({
        loggedSetCount: setCompletedAtBySessionExerciseId.get(se.id)?.length ?? 0,
        targetSetCount: targetByExerciseId.get(se.exerciseId)?.targetSets ?? null,
      })),
    [sessionExercises, setCompletedAtBySessionExerciseId, targetByExerciseId],
  );

  const defaultRestSeconds = Number(settings.defaultRestSeconds) || 90;
  const paceExercises = useMemo<PaceExercise[]>(
    () =>
      sessionExercises.map((se) => {
        const target = targetByExerciseId.get(se.exerciseId);
        return {
          targetSetCount: target?.targetSets ?? null,
          restSeconds: target?.targetRestSeconds ?? defaultRestSeconds,
          setCompletedAt: setCompletedAtBySessionExerciseId.get(se.id) ?? [],
        };
      }),
    [sessionExercises, targetByExerciseId, setCompletedAtBySessionExerciseId, defaultRestSeconds],
  );

  const clampedFocusedIndex = Math.min(focusedIndex, Math.max(0, sessionExercises.length - 1));
  const focusedItem = sessionExercises[clampedFocusedIndex];

  function handleToggleFocusMode() {
    if (!focusMode) setFocusedIndex(resolveFocusedExerciseIndex(focusCandidates));
    setFocusMode((prev) => !prev);
  }

  const currentNotes = notes ?? session?.notes ?? "";

  async function handleAddExercise(exerciseId: string) {
    const deviceId = await getDeviceId();
    const now = new Date();
    await mutate("sessionExercises", {
      id: uuidv7(),
      userId,
      sessionId: id,
      exerciseId,
      position: sessionExercises.length,
      supersetGroup: null,
      notes: null,
      updatedAt: now,
      deviceId,
      deletedAt: null,
      serverSeq: 0,
    });
    setPickerOpen(false);
  }

  async function handleRemoveExercise(itemId: string) {
    const item = rawSessionExercises?.find((se) => se.id === itemId);
    if (!item) return;
    const deviceId = await getDeviceId();
    await mutate("sessionExercises", {
      ...item,
      deletedAt: new Date(),
      updatedAt: new Date(),
      deviceId,
    });
  }

  async function handleNotesBlur() {
    if (!session) return;
    const deviceId = await getDeviceId();
    await mutate("sessions", {
      ...session,
      notes: currentNotes.trim() || null,
      updatedAt: new Date(),
      deviceId,
    });
  }

  async function handleFinalize() {
    if (!session) return;
    setFinalizing(true);
    try {
      const { cancelled } = await finalizeSession(session);
      if (cancelled) router.push("/workout");
    } finally {
      setFinalizing(false);
    }
  }

  async function handleCancel() {
    if (!session) return;
    const hasSets = [...setCompletedAtBySessionExerciseId.values()].some(
      (times) => times.length > 0,
    );
    const message = hasSets
      ? "Cancel this workout? Logged sets will not be saved."
      : "Cancel this workout?";
    if (!confirm(message)) return;
    setCancelling(true);
    try {
      await cancelSession(session);
      router.push("/workout");
    } finally {
      setCancelling(false);
    }
  }

  if (session === undefined || rawSessionExercises === undefined) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-500">Loading…</p>
      </main>
    );
  }

  if (session === null || session.deletedAt) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-xl font-semibold">Workout not found</h1>
        <Link href="/workout" className="text-sm font-medium underline underline-offset-4">
          Back to workout
        </Link>
      </main>
    );
  }

  if (session.endedAt) {
    return <SessionSummary session={session} sessionExercises={sessionExercises} />;
  }

  const excludeExerciseIds = new Set(sessionExercises.map((se) => se.exerciseId));

  return (
    <main
      className="flex flex-1 flex-col gap-4 px-4 py-4"
      onPointerDownCapture={primeRestAlertAudio}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{session.name ?? "Workout"}</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            Started{" "}
            {session.startedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => void handleCancel()}
            disabled={finalizing || cancelling}
            className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleFinalize()}
            disabled={finalizing || cancelling}
            className="min-h-11 rounded-lg bg-zinc-950 px-3 py-2 text-sm font-medium text-zinc-50 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
          >
            Finish
          </button>
        </div>
      </div>

      <PaceTracker startedAt={session.startedAt} exercises={paceExercises} />

      {sessionExercises.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleToggleFocusMode}
            className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium dark:border-zinc-700"
          >
            {focusMode ? "Show all exercises" : "Focus on current exercise"}
          </button>
        </div>
      )}

      {focusMode && focusedItem ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setFocusedIndex((i) => Math.max(0, i - 1))}
              disabled={clampedFocusedIndex === 0}
              className="min-h-12 rounded-lg border border-zinc-300 px-4 text-base font-medium disabled:opacity-40 dark:border-zinc-700"
            >
              ← Previous
            </button>
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-500">
              Exercise {clampedFocusedIndex + 1} of {sessionExercises.length}
            </p>
            <button
              type="button"
              onClick={() => setFocusedIndex((i) => Math.min(sessionExercises.length - 1, i + 1))}
              disabled={clampedFocusedIndex === sessionExercises.length - 1}
              className="min-h-12 rounded-lg bg-zinc-950 px-4 text-base font-medium text-zinc-50 disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-950"
            >
              Next exercise →
            </button>
          </div>
          <SessionExerciseSection
            key={focusedItem.id}
            sessionId={id}
            userId={userId}
            item={focusedItem}
            exercise={exerciseById.get(focusedItem.exerciseId)}
            target={targetByExerciseId.get(focusedItem.exerciseId)}
            settings={settings}
            large
            onSetLogged={(restSeconds) => restTimer.start(restSeconds)}
            onRemove={() => void handleRemoveExercise(focusedItem.id)}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sessionExercises.map((item) => (
            <SessionExerciseSection
              key={item.id}
              sessionId={id}
              userId={userId}
              item={item}
              exercise={exerciseById.get(item.exerciseId)}
              target={targetByExerciseId.get(item.exerciseId)}
              settings={settings}
              onSetLogged={(restSeconds) => restTimer.start(restSeconds)}
              onRemove={() => void handleRemoveExercise(item.id)}
            />
          ))}
        </div>
      )}

      {sessionExercises.length === 0 && (
        <p className="py-4 text-center text-sm text-zinc-500 dark:text-zinc-500">
          No exercises yet.
        </p>
      )}

      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="min-h-11 rounded-lg border border-zinc-300 px-4 py-3 text-base font-medium text-zinc-950 dark:border-zinc-700 dark:text-zinc-50"
      >
        Add exercise
      </button>

      <label className="flex flex-col gap-1 text-xs font-medium">
        Session notes
        <textarea
          value={currentNotes}
          onChange={(event) => setNotes(event.target.value)}
          onBlur={() => void handleNotesBlur()}
          rows={2}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </label>

      {pickerOpen && (
        <ExercisePicker
          userId={userId}
          excludeExerciseIds={excludeExerciseIds}
          onPick={(exerciseId) => void handleAddExercise(exerciseId)}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <RestTimerBar timer={restTimer} />
    </main>
  );
}
