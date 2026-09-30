"use client";

import { ExercisePicker } from "@/components/exercise-picker";
import { RoutineIconById } from "@/components/routines/routine-icon-by-id";
import {
  preferencesAction,
  removeExerciseAction,
  replaceExerciseAction,
  supersetActions,
} from "@/components/supersets/superset-actions";
import { primeRestAlertAudio } from "@/lib/audio/rest-alert";
import { mutate } from "@/lib/db/mutate";
import {
  type ExerciseRow,
  type RoutineExerciseRow,
  type SessionExerciseRow,
  type SetRow,
  db,
} from "@/lib/db/schema";
import { dprCallFor } from "@/lib/dpr/calls";
import { useDprContext } from "@/lib/dpr/use-dpr-calls";
import { cancelSession, finalizeSession } from "@/lib/sessions/finalize-session";
import { useRestTimer } from "@/lib/sessions/use-rest-timer";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { getDeviceId } from "@/lib/sync/engine";
import { useWakeLock } from "@/lib/wake-lock";
import {
  type PaceExercise,
  type SupersetChange,
  isFocusExerciseComplete,
  isLastRemainingSet,
  isWarmupComplete,
  isWarmupExercise,
  isWorkoutComplete,
  nextSupersetGroup,
  normalizeSupersets,
  partitionWarmups,
  resolveCurrentRows,
  resolveFocusedExerciseIndex,
  supersetBlocks,
  supersetFollowUp,
  supersetLabels,
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

/**
 * How many sets an exercise plans: the routine's target plus any warm-up
 * sets added from its ⋯ menu (issue #271). Null when there's neither, and
 * with warm-ups but no target, at least one working set after them.
 */
function plannedSetCountFor(
  item: SessionExerciseRow,
  target: RoutineExerciseRow | undefined,
): number | null {
  const targetSets = target?.targetSets ?? null;
  const warmupSets = item.warmupSets ?? 0;
  if (targetSets == null) return warmupSets > 0 ? warmupSets + 1 : null;
  return targetSets + warmupSets;
}

export function ActiveSession({ id, userId }: { id: string; userId: string }) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  // The exercise whose ⋯ Replace Exercise opened the picker (issue #271).
  const [replacingId, setReplacingId] = useState<string | null>(null);
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
  const dprContext = useDprContext();

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
  // Supersets (issue #228) are among the main exercises only — warm-ups
  // always sit in their own block.
  // Each superset's letter, keyed by its first exercise — where its heading goes.
  const supersetLetterByFirstId = useMemo(() => {
    const map = new Map<string, string>();
    for (const block of supersetBlocks(mainItems)) {
      const first = block.items[0];
      if (block.letter && first) map.set(first.id, block.letter);
    }
    return map;
  }, [mainItems]);
  const supersetLabelById = useMemo(() => supersetLabels(mainItems), [mainItems]);
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
        targetSetCount: plannedSetCountFor(se, targetByExerciseId.get(se.exerciseId)),
      })),
    [sessionExercises, exerciseById, setCompletedAtBySessionExerciseId, targetByExerciseId],
  );

  // Issue #232: once every planned set is logged the lifter is at the bottom
  // of the page, so Finish is offered there too. Warm-ups don't count, same
  // as the last-set rest rule, unless the workout is nothing but warm-ups.
  const allSetsLogged = useMemo(() => {
    const mainIds = new Set(mainItems.map((se) => se.id));
    const main = focusCandidates.filter((candidate) => mainIds.has(candidate.id));
    return hasLoggedSets && isWorkoutComplete(main.length > 0 ? main : focusCandidates);
  }, [mainItems, focusCandidates, hasLoggedSets]);

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
          targetSetCount: plannedSetCountFor(se, target),
          restSeconds: se.restSeconds ?? target?.targetRestSeconds ?? defaultRestSeconds,
          setCompletedAt: setCompletedAtBySessionExerciseId.get(se.id) ?? [],
        };
      }),
    [mainItems, targetByExerciseId, setCompletedAtBySessionExerciseId, defaultRestSeconds],
  );

  // Issue #231: no rest after the workout's final set — there's no next set
  // to rest for. Warm-ups don't count; they have their own timer. In a
  // superset (issue #228) the rest comes after each round, not each set, and
  // focus mode moves on to the next exercise in the round by itself.
  function handleSetLogged(itemId: string, restSeconds: number, remainingPlannedSets: number) {
    const mainIds = new Set(mainItems.map((se) => se.id));
    const others = focusCandidates.filter(
      (candidate) => candidate.id !== itemId && mainIds.has(candidate.id),
    );
    if (isLastRemainingSet(remainingPlannedSets, others)) {
      // A rest still counting down from an earlier set would push "Time for
      // your next set" with nothing left to do.
      restTimer.skip();
      return;
    }
    const candidateById = new Map(focusCandidates.map((candidate) => [candidate.id, candidate]));
    const followUp = supersetFollowUp(mainItems, itemId, (id) => {
      if (id === itemId) return remainingPlannedSets === 0;
      const candidate = candidateById.get(id);
      return candidate != null && isFocusExerciseComplete(candidate);
    });
    // A rest of 0 is the ⋯ menu's "Off" (issue #271).
    if (followUp.rest && restSeconds > 0) restTimer.start(restSeconds);
    else restTimer.skip();
    if (focusMode && followUp.nextId) {
      const nextIndex = sessionExercises.findIndex((se) => se.id === followUp.nextId);
      if (nextIndex !== -1) setFocusedIndex(nextIndex);
    }
  }

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

  // Picking several exercises at once adds them as one superset (issue #269).
  async function handleAddExercises(exerciseIds: readonly string[]) {
    const deviceId = await getDeviceId();
    const now = new Date();
    const supersetGroup = exerciseIds.length > 1 ? nextSupersetGroup(mainItems) : null;
    for (const [offset, exerciseId] of exerciseIds.entries()) {
      await mutate("sessionExercises", {
        id: uuidv7(),
        userId,
        sessionId: id,
        exerciseId,
        position: sessionExercises.length + offset,
        supersetGroup,
        notes: null,
        stickyNote: null,
        restSeconds: null,
        warmupSets: null,
        updatedAt: now,
        deviceId,
        deletedAt: null,
        serverSeq: 0,
      });
    }
    setPickerOpen(false);
  }

  async function applySupersetChanges(changes: readonly SupersetChange[]) {
    if (changes.length === 0) return;
    const deviceId = await getDeviceId();
    const now = new Date();
    for (const change of changes) {
      const item = mainItems.find((se) => se.id === change.id);
      if (!item) continue;
      await mutate("sessionExercises", {
        ...item,
        supersetGroup: change.supersetGroup,
        updatedAt: now,
        deviceId,
      });
    }
  }

  // Only offered before a set is logged: logged sets belong to the exercise
  // they were lifted on, and they're append-only (ADR-003).
  async function handleReplaceExercise(itemId: string, exerciseId: string) {
    const item = rawSessionExercises?.find((se) => se.id === itemId);
    setReplacingId(null);
    if (!item) return;
    const deviceId = await getDeviceId();
    await mutate("sessionExercises", {
      ...item,
      exerciseId,
      notes: null,
      stickyNote: null,
      restSeconds: null,
      warmupSets: null,
      updatedAt: new Date(),
      deviceId,
    });
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
    await applySupersetChanges(normalizeSupersets(mainItems.filter((se) => se.id !== itemId)));
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
      ? "Discard this workout? Logged sets will not be saved."
      : "Discard this workout?";
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

  function hasLogged(itemId: string) {
    return (setCompletedAtBySessionExerciseId.get(itemId)?.length ?? 0) > 0;
  }

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
          actions={[
            preferencesAction(item.exerciseId, router.push),
            removeExerciseAction(() => void handleRemoveExercise(item.id)),
          ]}
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
        dpr={
          dprContext ? dprCallFor(dprContext, item.exerciseId, target, session?.intensity) : null
        }
        large={large}
        supersetLabel={supersetLabelById.get(item.id) ?? null}
        onSetLogged={(restSeconds, remainingPlannedSets) =>
          handleSetLogged(item.id, restSeconds, remainingPlannedSets)
        }
        actions={[
          ...(hasLogged(item.id) ? [] : [replaceExerciseAction(() => setReplacingId(item.id))]),
          // Supersets are among the main exercises only (warm-ups return above).
          ...supersetActions(
            mainItems,
            mainItems.findIndex((se) => se.id === item.id),
            (changes) => void applySupersetChanges(changes),
          ),
          preferencesAction(item.exerciseId, router.push),
          removeExerciseAction(() => void handleRemoveExercise(item.id)),
        ]}
      />
    );
  }

  return (
    // route-fade: eases the swap from "Loading…" to the workout itself.
    <main
      className="route-fade flex flex-1 flex-col gap-4 px-4 py-4"
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
        {/* Issue #321: Finish is the header's only action; discarding the
            workout lives at the bottom of the page, away from it. */}
        <div className="flex shrink-0 gap-2">
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
            // Issue #261: once everything is logged, Finish lives in the
            // "Up next" spot at the bottom instead of the top bar. Discard
            // isn't offered here at all (issue #321): it would share a bar
            // with the ✕ that only closes Focus.
            hasLoggedSets && !allSetsLogged ? (
              <button
                type="button"
                onClick={() => void handleFinalize()}
                disabled={finalizing || cancelling}
                className="min-h-11 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
              >
                Finish
              </button>
            ) : undefined
          }
          footer={<RestTimerBar timer={restTimer} />}
          finishAction={
            allSetsLogged ? (
              <button
                type="button"
                onClick={() => void handleFinalize()}
                disabled={finalizing || cancelling}
                className="min-h-14 flex-1 rounded-xl bg-accent px-4 text-lg font-semibold text-accent-foreground disabled:opacity-50"
              >
                Finish workout
              </button>
            ) : undefined
          }
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
          {mainItems.map((item) => {
            // Flat and keyed by item so linking mid-workout doesn't remount
            // an exercise and drop what's typed into it.
            const label = supersetLabelById.get(item.id);
            const startsSuperset = supersetLetterByFirstId.get(item.id);
            return (
              <div
                key={item.id}
                className={`flex flex-col gap-1 ${label ? "border-l-4 border-l-accent pl-2" : ""}`}
              >
                {startsSuperset && (
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                    Superset {startsSuperset} · rest after each round
                  </p>
                )}
                {renderExercise(item)}
              </div>
            );
          })}
          {allSetsLogged && (
            <button
              type="button"
              onClick={() => void handleFinalize()}
              disabled={finalizing || cancelling}
              className="min-h-14 rounded-xl bg-accent px-4 text-lg font-semibold text-accent-foreground disabled:opacity-50"
            >
              Finish workout
            </button>
          )}
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

      <button
        type="button"
        onClick={() => void handleCancel()}
        disabled={finalizing || cancelling}
        className="min-h-11 self-center px-4 text-sm font-medium text-red-600 disabled:opacity-50 dark:text-red-500"
      >
        Discard workout
      </button>

      {pickerOpen && (
        <ExercisePicker
          userId={userId}
          excludeExerciseIds={excludeExerciseIds}
          onPick={(exerciseIds) => void handleAddExercises(exerciseIds)}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {replacingId && (
        <ExercisePicker
          userId={userId}
          mode="replace"
          excludeExerciseIds={excludeExerciseIds}
          onPick={([exerciseId]) => {
            if (exerciseId) void handleReplaceExercise(replacingId, exerciseId);
          }}
          onClose={() => setReplacingId(null)}
        />
      )}

      {!(focusMode && focusedItem) && <RestTimerBar timer={restTimer} aboveTabBar />}
    </main>
  );
}
