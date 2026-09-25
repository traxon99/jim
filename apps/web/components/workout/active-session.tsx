"use client";

import { ExercisePicker } from "@/components/exercise-picker";
import { RoutineIconById } from "@/components/routines/routine-icon-by-id";
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
  isWarmupComplete,
  isWarmupExercise,
  partitionWarmups,
  resolveCurrentRows,
  resolveFocusedExerciseIndex,
  uuidv7,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { Focus, LayoutList } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FocusView, type FocusViewExercise } from "./focus-view";
import { PaceTracker } from "./pace-tracker";
import { RestTimerBar } from "./rest-timer-bar";
import { SessionExerciseSection } from "./session-exercise-section";
import { SessionSummary } from "./session-summary";
import { WarmupBlock } from "./warmup-block";
import { WarmupExerciseSection } from "./warmup-exercise-section";

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
  const routine = useLiveQuery(
    async () => (session?.routineId ? await db.routines.get(session.routineId) : undefined),
    [session?.routineId],
  );
  const warmupRoutineId = routine?.warmupRoutineId ?? null;
  const warmupRoutine = useLiveQuery(
    async () => (warmupRoutineId ? await db.routines.get(warmupRoutineId) : undefined),
    [warmupRoutineId],
  );
  // The linked warm-up routine's items come first so the session routine's
  // own entry for the same exercise (if any) wins as the target below.
  const rawRoutineExercises = useLiveQuery(async () => {
    const routineIds = [warmupRoutineId, session?.routineId].filter(
      (routineId): routineId is string => Boolean(routineId),
    );
    if (routineIds.length === 0) return [] as RoutineExerciseRow[];
    const rows = await db.routineExercises.where("routineId").anyOf(routineIds).toArray();
    return rows.sort((a, b) => routineIds.indexOf(a.routineId) - routineIds.indexOf(b.routineId));
  }, [session?.routineId, warmupRoutineId]);
  const settings = useLiveQuery(() => db.settings.get("me"), []) ?? DEFAULT_SETTINGS;

  const restTimer = useRestTimer(id);
  const isActive = session != null && !session.endedAt && !session.deletedAt;
  useWakeLock(isActive);

  const exerciseById = useMemo(() => {
    const map = new Map<string, ExerciseRow>();
    for (const exercise of exercises ?? []) map.set(exercise.id, exercise);
    return map;
  }, [exercises]);

  // Warm-ups (issue #59) always display as one block at the top, even one
  // added mid-workout — so the display order is warm-ups, then the rest.
  const { warmupItems, mainItems } = useMemo(() => {
    const live = (rawSessionExercises ?? [])
      .filter((se) => !se.deletedAt)
      .sort((a, b) => a.position - b.position);
    const { warmups, main } = partitionWarmups(live, (exerciseId) => {
      const exercise = exerciseById.get(exerciseId);
      return exercise != null && isWarmupExercise(exercise);
    });
    return { warmupItems: warmups, mainItems: main };
  }, [rawSessionExercises, exerciseById]);
  const sessionExercises = useMemo(() => [...warmupItems, ...mainItems], [warmupItems, mainItems]);
  const warmupTargetMinutes = routine?.warmupMinutes ?? warmupRoutine?.warmupMinutes ?? null;

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

  // Issue #156: a workout with nothing logged has nothing to finish — the
  // only thing to do with it is cancel, so Finish isn't offered until then.
  const hasLoggedSets = useMemo(
    () => [...setCompletedAtBySessionExerciseId.values()].some((times) => times.length > 0),
    [setCompletedAtBySessionExerciseId],
  );

  const focusCandidates = useMemo<FocusViewExercise[]>(
    () =>
      sessionExercises.map((se) => ({
        id: se.id,
        name: exerciseById.get(se.exerciseId)?.name ?? "Exercise",
        loggedSetCount: setCompletedAtBySessionExerciseId.get(se.id)?.length ?? 0,
        targetSetCount: targetByExerciseId.get(se.exerciseId)?.targetSets ?? null,
      })),
    [sessionExercises, exerciseById, setCompletedAtBySessionExerciseId, targetByExerciseId],
  );

  const warmupComplete = useMemo(() => {
    const warmupIds = new Set(warmupItems.map((se) => se.id));
    return isWarmupComplete(focusCandidates.filter((candidate) => warmupIds.has(candidate.id)));
  }, [warmupItems, focusCandidates]);

  // When the main workout started: its first logged set ends the warm-up timer.
  const mainStartedAt = useMemo(() => {
    let earliest: Date | null = null;
    for (const se of mainItems) {
      for (const at of setCompletedAtBySessionExerciseId.get(se.id) ?? []) {
        if (!earliest || at < earliest) earliest = at;
      }
    }
    return earliest;
  }, [mainItems, setCompletedAtBySessionExerciseId]);

  const defaultRestSeconds = Number(settings.defaultRestSeconds) || 90;
  // Pace is about the lifting — warm-ups have their own timer.
  const paceExercises = useMemo<PaceExercise[]>(
    () =>
      mainItems.map((se) => {
        const target = targetByExerciseId.get(se.exerciseId);
        return {
          targetSetCount: target?.targetSets ?? null,
          restSeconds: target?.targetRestSeconds ?? defaultRestSeconds,
          setCompletedAt: setCompletedAtBySessionExerciseId.get(se.id) ?? [],
        };
      }),
    [mainItems, targetByExerciseId, setCompletedAtBySessionExerciseId, defaultRestSeconds],
  );

  const clampedFocusedIndex = Math.min(focusedIndex, Math.max(0, sessionExercises.length - 1));
  const focusedItem = sessionExercises[clampedFocusedIndex];

  function handleSetFocusMode(next: boolean) {
    if (next && !focusMode) setFocusedIndex(resolveFocusedExerciseIndex(focusCandidates));
    setFocusMode(next);
  }
  const exitFocusMode = useCallback(() => setFocusMode(false), []);

  const currentNotes = notes ?? session?.notes ?? "";

  const notFound = session === null || session?.deletedAt != null;
  useEffect(() => {
    if (notFound) router.replace("/workout");
  }, [notFound, router]);

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
    if (!session || !hasLoggedSets) return;
    setFinalizing(true);
    try {
      const { cancelled } = await finalizeSession(session);
      // A rest still counting down would otherwise push "Time for your
      // next set" after the workout is over.
      restTimer.skip();
      if (cancelled) router.replace("/workout");
    } finally {
      setFinalizing(false);
    }
  }

  async function handleCancel() {
    if (!session) return;
    const message = hasLoggedSets
      ? "Cancel this workout? Logged sets will not be saved."
      : "Cancel this workout?";
    if (!confirm(message)) return;
    setCancelling(true);
    try {
      await cancelSession(session);
      restTimer.skip();
      // Replace, not push: the cancelled session's URL shouldn't stay in
      // history for Back to land on.
      router.replace("/workout");
    } finally {
      setCancelling(false);
    }
  }

  if (session === undefined || rawSessionExercises === undefined || notFound) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-500">Loading…</p>
      </main>
    );
  }

  if (session.endedAt) {
    return <SessionSummary session={session} sessionExercises={sessionExercises} />;
  }

  const excludeExerciseIds = new Set(sessionExercises.map((se) => se.exerciseId));

  function renderExercise(item: (typeof sessionExercises)[number], large = false) {
    const exercise = exerciseById.get(item.exerciseId);
    const target = targetByExerciseId.get(item.exerciseId);
    if (exercise && isWarmupExercise(exercise)) {
      return (
        <WarmupExerciseSection
          key={item.id}
          userId={userId}
          item={item}
          exercise={exercise}
          target={target}
          large={large}
          onRemove={() => void handleRemoveExercise(item.id)}
        />
      );
    }
    return (
      <SessionExerciseSection
        key={item.id}
        sessionId={id}
        userId={userId}
        item={item}
        exercise={exercise}
        target={target}
        settings={settings}
        large={large}
        onSetLogged={(restSeconds) => restTimer.start(restSeconds)}
        onRemove={() => void handleRemoveExercise(item.id)}
      />
    );
  }

  return (
    <main
      className="flex flex-1 flex-col gap-4 px-4 py-4"
      onPointerDownCapture={primeRestAlertAudio}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <RoutineIconById routineId={session.routineId} className="h-5 w-5" />
            {session.name ?? "Workout"}
          </h1>
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
          {hasLoggedSets && (
            <button
              type="button"
              onClick={() => void handleFinalize()}
              disabled={finalizing || cancelling}
              className="min-h-11 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
            >
              Finish
            </button>
          )}
        </div>
      </div>

      {(settings.showPaceTracker ?? DEFAULT_SETTINGS.showPaceTracker) && (
        <PaceTracker startedAt={session.startedAt} exercises={paceExercises} />
      )}

      {sessionExercises.length > 0 && (
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
          {(
            [
              { value: false, label: "All exercises", Icon: LayoutList },
              { value: true, label: "Focus", Icon: Focus },
            ] as const
          ).map(({ value, label, Icon }) => {
            const selected = focusMode === value;
            return (
              <button
                key={label}
                type="button"
                aria-pressed={selected}
                onClick={() => handleSetFocusMode(value)}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors ${
                  selected
                    ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
                    : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>
      )}

      {focusMode && focusedItem ? (
        <FocusView
          title={session.name ?? "Workout"}
          titleIcon={<RoutineIconById routineId={session.routineId} />}
          exercises={focusCandidates}
          index={clampedFocusedIndex}
          onIndexChange={(i) =>
            setFocusedIndex(Math.min(Math.max(0, i), sessionExercises.length - 1))
          }
          onExit={exitFocusMode}
          headerAction={
            hasLoggedSets ? (
              <button
                type="button"
                onClick={() => void handleFinalize()}
                disabled={finalizing || cancelling}
                className="min-h-11 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
              >
                Finish
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleCancel()}
                disabled={finalizing || cancelling}
                className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
              >
                Cancel
              </button>
            )
          }
          footer={<RestTimerBar timer={restTimer} />}
        >
          {renderExercise(focusedItem, true)}
        </FocusView>
      ) : (
        <div className="flex flex-col gap-3">
          {warmupItems.length > 0 && (
            <WarmupBlock
              startedAt={session.startedAt}
              targetMinutes={warmupTargetMinutes}
              endedAt={mainStartedAt}
              complete={warmupComplete}
            >
              {warmupItems.map((item) => renderExercise(item))}
            </WarmupBlock>
          )}
          {mainItems.map((item) => renderExercise(item))}
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

      {!(focusMode && focusedItem) && <RestTimerBar timer={restTimer} />}
    </main>
  );
}
