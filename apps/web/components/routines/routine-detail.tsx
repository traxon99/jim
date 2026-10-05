"use client";

import { ExercisePicker } from "@/components/exercise-picker";
import { LoadingText } from "@/components/loading-text";
import { BackLink } from "@/components/page-header";
import { ShareLinkButton } from "@/components/sharing/share-link-button";
import {
  preferencesAction,
  removeExerciseAction,
  replaceExerciseAction,
  supersetActions,
  supersetMemberIds,
} from "@/components/supersets/superset-actions";
import { SupersetBadge } from "@/components/supersets/superset-badge";
import { SupersetPickerCard } from "@/components/supersets/superset-picker-card";
import { PreWorkoutSheet } from "@/components/workout/pre-workout-sheet";
import { mutate } from "@/lib/db/mutate";
import { type RoutineExerciseRow, db } from "@/lib/db/schema";
import { useDprContext } from "@/lib/dpr/use-dpr-calls";
import { routineItemSummary } from "@/lib/routines/summary";
import { startSessionFromRoutineId } from "@/lib/sessions/start-session";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { buildRoutineSnapshot } from "@/lib/sharing/local";
import { getDeviceId } from "@/lib/sync/engine";
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  type SessionIntensity,
  type SupersetChange,
  duplicateRoutine,
  formSuperset,
  isWarmupExercise,
  isWarmupRoutine,
  nextSupersetGroup,
  normalizeSupersets,
  reorderRoutineExercises,
  supersetLabels,
  uuidv7,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { Flame, Pencil, Play } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { RoutineExerciseRow as RoutineExerciseRowItem } from "./routine-exercise-row";
import { RoutineIcon } from "./routine-icon";

export function RoutineDetail({ id, userId }: { id: string; userId: string }) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  // The row whose ⋯ Replace Exercise opened the picker (issue #271).
  const [replacing, setReplacing] = useState<RoutineExerciseRow | null>(null);
  // The exercise whose Create/Edit Superset card is open (issue #360).
  const [supersetFromId, setSupersetFromId] = useState<string | null>(null);
  // Issue #326: the page opens as a read-only preview with a Start button;
  // the pencil switches it to the editor (targets, order, add, remove).
  const [editing, setEditing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const dprContext = useDprContext();

  const routine = useLiveQuery(async () => (await db.routines.get(id)) ?? null, [id]);
  const rawItems = useLiveQuery(
    () => db.routineExercises.where("routineId").equals(id).toArray(),
    [id],
  );
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  // Starting is blocked while another workout is open (it'd be left running),
  // and the latest finished one from this routine shows as "last done".
  const sessionInfo = useLiveQuery(async () => {
    const sessions = (await db.sessions.toArray()).filter((session) => !session.deletedAt);
    const active = sessions.find((session) => !session.endedAt) ?? null;
    let lastDone: Date | null = null;
    for (const session of sessions) {
      if (session.routineId !== id || !session.endedAt) continue;
      if (!lastDone || session.startedAt > lastDone) lastDone = session.startedAt;
    }
    return { activeId: active?.id ?? null, lastDone };
  }, [id]);
  const settings = useLiveQuery(() => db.settings.get("me"), []) ?? DEFAULT_SETTINGS;
  const warmupRoutineId = routine?.warmupRoutineId ?? null;
  const linkedWarmup = useLiveQuery(async () => {
    if (!warmupRoutineId) return null;
    const warmup = await db.routines.get(warmupRoutineId);
    if (!warmup || warmup.deletedAt) return null;
    const warmupItems = await db.routineExercises
      .where("routineId")
      .equals(warmupRoutineId)
      .toArray();
    return { routine: warmup, count: warmupItems.filter((item) => !item.deletedAt).length };
  }, [warmupRoutineId]);

  const items = useMemo(() => {
    return (rawItems ?? [])
      .filter((item) => !item.deletedAt)
      .sort((a, b) => a.position - b.position);
  }, [rawItems]);

  const exercisesById = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        mechanic: "compound" | "isolation" | null;
        warmup: { timed: boolean } | null;
      }
    >();
    for (const exercise of exercises ?? []) {
      map.set(exercise.id, {
        name: exercise.name,
        mechanic: exercise.mechanic,
        warmup: isWarmupExercise(exercise) ? { timed: exercise.trackingType === "time" } : null,
      });
    }
    return map;
  }, [exercises]);

  const labels = useMemo(() => supersetLabels(items), [items]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const reordered = reorderRoutineExercises(items, String(active.id), String(over.id));
    // A move can split a superset or strand one member (issue #228).
    const groups = new Map(
      normalizeSupersets(reordered).map((change) => [change.id, change.supersetGroup]),
    );
    const deviceId = await getDeviceId();
    const now = new Date();

    for (const reorderedItem of reordered) {
      const original = items.find((item) => item.id === reorderedItem.id);
      if (!original) continue;
      const supersetGroup = groups.has(original.id)
        ? (groups.get(original.id) ?? null)
        : original.supersetGroup;
      if (original.position === reorderedItem.position && original.supersetGroup === supersetGroup)
        continue;
      await mutate("routineExercises", {
        ...original,
        position: reorderedItem.position,
        supersetGroup,
        updatedAt: now,
        deviceId,
      });
    }
  }

  async function applySupersetChanges(changes: readonly SupersetChange[]) {
    if (changes.length === 0) return;
    const deviceId = await getDeviceId();
    const now = new Date();
    for (const change of changes) {
      const original = items.find((item) => item.id === change.id);
      if (!original) continue;
      await mutate("routineExercises", {
        ...original,
        supersetGroup: change.supersetGroup,
        updatedAt: now,
        deviceId,
      });
    }
  }

  // The card's picks become one superset, moved together (issue #360).
  async function handleFormSuperset(selectedIds: readonly string[], editingIds: readonly string[]) {
    const positions = items.map((item) => item.position);
    const formed = formSuperset(items, selectedIds, editingIds);
    const deviceId = await getDeviceId();
    const now = new Date();
    for (const [index, item] of formed.entries()) {
      const original = items.find((other) => other.id === item.id);
      const position = positions[index] ?? item.position;
      if (!original) continue;
      if (original.position === position && original.supersetGroup === item.supersetGroup) continue;
      await mutate("routineExercises", {
        ...original,
        position,
        supersetGroup: item.supersetGroup,
        updatedAt: now,
        deviceId,
      });
    }
  }

  // Picking several exercises at once adds them as one superset (issue #269).
  async function handleAddExercises(exerciseIds: readonly string[]) {
    const deviceId = await getDeviceId();
    const now = new Date();
    const supersetGroup = exerciseIds.length > 1 ? nextSupersetGroup(items) : null;
    for (const [offset, exerciseId] of exerciseIds.entries()) {
      const entity: RoutineExerciseRow = {
        id: uuidv7(),
        userId,
        routineId: id,
        exerciseId,
        position: items.length + offset,
        supersetGroup,
        targetSets: null,
        targetRepsLow: null,
        targetRepsHigh: null,
        targetRestSeconds: null,
        targetDurationSeconds: null,
        targetWeight: null,
        notes: null,
        updatedAt: now,
        deviceId,
        deletedAt: null,
        serverSeq: 0,
      };
      await mutate("routineExercises", entity);
    }
    setPickerOpen(false);
  }

  async function handleUpdateItem(item: RoutineExerciseRow, patch: Partial<RoutineExerciseRow>) {
    const deviceId = await getDeviceId();
    await mutate("routineExercises", { ...item, ...patch, updatedAt: new Date(), deviceId });
  }

  async function handleRemoveItem(item: RoutineExerciseRow) {
    const deviceId = await getDeviceId();
    await mutate("routineExercises", {
      ...item,
      deletedAt: new Date(),
      updatedAt: new Date(),
      deviceId,
    });
    await applySupersetChanges(normalizeSupersets(items.filter((other) => other.id !== item.id)));
  }

  async function startRoutine(intensity: SessionIntensity | null) {
    setStarting(true);
    try {
      const sessionId = await startSessionFromRoutineId(userId, id, intensity);
      router.push(`/workout/${sessionId}`);
    } catch {
      // Nothing was started; let the button be tapped again.
      setStarting(false);
    }
  }

  // DPR users pick today's intensity in the pre-workout sheet first, as on
  // the Workout tab; everyone else starts straight away.
  function handleStart() {
    if (dprContext) setSheetOpen(true);
    else void startRoutine(null);
  }

  async function handleDuplicate() {
    if (!routine) return;
    const deviceId = await getDeviceId();
    const now = new Date();
    const { routine: newRoutine, items: newItems } = duplicateRoutine(
      routine,
      items,
      userId,
      uuidv7,
    );

    await mutate("routines", { ...newRoutine, createdAt: now, updatedAt: now, deviceId });
    for (const newItem of newItems) {
      await mutate("routineExercises", { ...newItem, updatedAt: now, deviceId });
    }
    router.push(`/routines/${newRoutine.id}`);
  }

  async function handleDelete() {
    if (!routine) return;
    if (!confirm(`Delete "${routine.name}"? Past sessions built from it are unaffected.`)) return;
    const deviceId = await getDeviceId();
    await mutate("routines", {
      ...routine,
      deletedAt: new Date(),
      updatedAt: new Date(),
      deviceId,
    });
    router.push("/routines");
  }

  if (routine === undefined || rawItems === undefined) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <LoadingText />
      </main>
    );
  }

  if (routine === null || routine.deletedAt) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-xl font-semibold">Routine not found</h1>
        <Link href="/routines" className="text-sm font-medium underline underline-offset-4">
          Back to routines
        </Link>
      </main>
    );
  }

  const excludeExerciseIds = new Set(items.map((item) => item.exerciseId));
  const isWarmupKind = isWarmupRoutine(routine);
  const warmupMinutes = routine.warmupMinutes ?? linkedWarmup?.routine.warmupMinutes ?? null;

  return (
    <main className="flex flex-1 flex-col gap-4 px-4 py-4">
      <div className="self-start">
        <BackLink href="/routines" label="Routines" />
      </div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <RoutineIcon shape={routine.iconShape} color={routine.iconColor} className="h-5 w-5" />
            {routine.name}
          </h1>
          {(isWarmupKind || routine.folder) && (
            <p className="text-xs text-zinc-500 dark:text-zinc-500">
              {[
                isWarmupKind ? "Warm-up routine" : null,
                isWarmupKind && warmupMinutes != null ? `${warmupMinutes} min` : null,
                routine.folder,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          {routine.notes && (
            <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{routine.notes}</p>
          )}
        </div>
        {editing ? (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="min-h-11 shrink-0 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground"
          >
            Done
          </button>
        ) : (
          <div className="flex shrink-0 items-start">
            <ShareLinkButton title={routine.name} build={() => buildRoutineSnapshot(routine.id)} />
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Edit routine"
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-zinc-500 dark:text-zinc-500"
            >
              <Pencil className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {!editing && (
        <div className="flex flex-col gap-2">
          {sessionInfo?.activeId ? (
            <Link
              href={`/workout/${sessionInfo.activeId}`}
              className="flex min-h-14 items-center justify-center rounded-xl border border-zinc-300 px-4 text-base font-semibold dark:border-zinc-700"
            >
              Resume workout in progress
            </Link>
          ) : (
            <button
              type="button"
              onClick={handleStart}
              disabled={starting || items.length === 0}
              className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-lg font-semibold text-accent-foreground disabled:opacity-50"
            >
              <Play className="h-5 w-5 fill-current" strokeWidth={2} aria-hidden="true" />
              Start routine
            </button>
          )}
          <p className="text-center text-xs text-zinc-500 dark:text-zinc-500">
            {sessionInfo?.lastDone
              ? `Last done ${sessionInfo.lastDone.toLocaleDateString([], {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}`
              : "Not done yet"}
          </p>
        </div>
      )}

      {editing && (
        <Link
          href={`/routines/${routine.id}/edit`}
          className="self-start text-sm font-medium underline underline-offset-4"
        >
          Edit name, icon and warm-up
        </Link>
      )}

      {!isWarmupKind && (linkedWarmup || warmupMinutes != null) && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-orange-200 bg-orange-50/50 px-3 py-2 dark:border-orange-900/60 dark:bg-orange-950/20">
          <span className="flex min-w-0 items-center gap-2 text-sm">
            <Flame
              className="h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className="font-medium">Warm-up</span>
              {linkedWarmup && (
                <>
                  {": "}
                  <Link
                    href={`/routines/${linkedWarmup.routine.id}`}
                    className="underline underline-offset-4"
                  >
                    {linkedWarmup.routine.name}
                  </Link>
                  {` · ${linkedWarmup.count} exercise${linkedWarmup.count === 1 ? "" : "s"}`}
                </>
              )}
            </span>
          </span>
          {warmupMinutes != null && (
            <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-500">
              {warmupMinutes} min
            </span>
          )}
        </div>
      )}

      {!editing && (
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {items.map((item) => {
            const info = exercisesById.get(item.exerciseId);
            const label = labels.get(item.id);
            const summary = routineItemSummary(item, settings.units, info?.warmup?.timed ?? false);
            return (
              <li key={item.id} className="flex flex-col gap-0.5 py-3">
                <span className="flex items-center gap-2 text-base font-medium">
                  {label && <SupersetBadge label={label} />}
                  {info?.name ?? "Unknown exercise"}
                </span>
                <span className="text-sm tabular-nums text-zinc-500 dark:text-zinc-500">
                  {summary ?? "No targets set"}
                </span>
                {item.notes && (
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">{item.notes}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext
            items={items.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-2">
              {items.map((item, index) => (
                <RoutineExerciseRowItem
                  key={item.id}
                  item={item}
                  supersetLabel={labels.get(item.id) ?? null}
                  actions={[
                    replaceExerciseAction(() => setReplacing(item)),
                    ...supersetActions(
                      items,
                      index,
                      (changes) => void applySupersetChanges(changes),
                      () => setSupersetFromId(item.id),
                    ),
                    preferencesAction(item.exerciseId, router.push),
                    removeExerciseAction(() => void handleRemoveItem(item)),
                  ]}
                  exerciseName={exercisesById.get(item.exerciseId)?.name ?? "Unknown exercise"}
                  warmup={exercisesById.get(item.exerciseId)?.warmup ?? null}
                  units={settings.units}
                  onUpdate={(patch) => handleUpdateItem(item, patch)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {items.length === 0 && (
        <p className="py-4 text-center text-sm text-zinc-500 dark:text-zinc-500">
          No exercises yet.
        </p>
      )}

      {editing && (
        <>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="rounded-lg border border-zinc-300 px-4 py-3 text-base font-medium text-zinc-950 dark:border-zinc-700 dark:text-zinc-50"
          >
            Add exercise
          </button>

          <div className="mt-4 flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <button
              type="button"
              onClick={handleDuplicate}
              className="rounded-lg border border-zinc-300 px-4 py-3 text-base font-medium text-zinc-950 dark:border-zinc-700 dark:text-zinc-50"
            >
              Duplicate
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-lg border border-red-300 px-4 py-3 text-base font-medium text-red-600 dark:border-red-900 dark:text-red-500"
            >
              Delete
            </button>
          </div>
        </>
      )}

      {sheetOpen && (
        <PreWorkoutSheet
          context={dprContext}
          routineId={routine.id}
          routineName={routine.name}
          starting={starting}
          onStart={(intensity) => void startRoutine(intensity)}
          onCancel={closeSheet}
        />
      )}

      {pickerOpen && (
        <ExercisePicker
          userId={userId}
          excludeExerciseIds={excludeExerciseIds}
          initialCategory={isWarmupKind ? "warmup" : "all"}
          onPick={(exerciseIds) => void handleAddExercises(exerciseIds)}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {supersetFromId &&
        (() => {
          const memberIds = supersetMemberIds(items, supersetFromId);
          const editing = memberIds.length > 1;
          return (
            <SupersetPickerCard
              exercises={items.map((item) => ({
                id: item.id,
                name: exercisesById.get(item.exerciseId)?.name ?? "Unknown exercise",
              }))}
              initialSelectedIds={memberIds}
              editing={editing}
              onSave={(ids) => void handleFormSuperset(ids, editing ? memberIds : [])}
              onClose={() => setSupersetFromId(null)}
            />
          );
        })()}

      {replacing && (
        <ExercisePicker
          userId={userId}
          mode="replace"
          excludeExerciseIds={excludeExerciseIds}
          initialCategory={isWarmupKind ? "warmup" : "all"}
          onPick={([exerciseId]) => {
            setReplacing(null);
            // The targets stay: they're this slot's plan, whichever lift fills it.
            if (exerciseId) void handleUpdateItem(replacing, { exerciseId });
          }}
          onClose={() => setReplacing(null)}
        />
      )}
    </main>
  );
}
