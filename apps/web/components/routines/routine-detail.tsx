"use client";

import { ExercisePicker } from "@/components/exercise-picker";
import { mutate } from "@/lib/db/mutate";
import { type RoutineExerciseRow, db } from "@/lib/db/schema";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { getDeviceId } from "@/lib/sync/engine";
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  duplicateRoutine,
  isWarmupExercise,
  isWarmupRoutine,
  reorderRoutineExercises,
  uuidv7,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { Flame, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { RoutineExerciseRow as RoutineExerciseRowItem } from "./routine-exercise-row";
import { RoutineIcon } from "./routine-icon";

export function RoutineDetail({ id, userId }: { id: string; userId: string }) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);

  const routine = useLiveQuery(async () => (await db.routines.get(id)) ?? null, [id]);
  const rawItems = useLiveQuery(
    () => db.routineExercises.where("routineId").equals(id).toArray(),
    [id],
  );
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const reordered = reorderRoutineExercises(items, String(active.id), String(over.id));
    const deviceId = await getDeviceId();
    const now = new Date();

    for (const reorderedItem of reordered) {
      const original = items.find((item) => item.id === reorderedItem.id);
      if (!original || original.position === reorderedItem.position) continue;
      await mutate("routineExercises", {
        ...original,
        position: reorderedItem.position,
        updatedAt: now,
        deviceId,
      });
    }
  }

  async function handleAddExercise(exerciseId: string) {
    const deviceId = await getDeviceId();
    const now = new Date();
    const entity: RoutineExerciseRow = {
      id: uuidv7(),
      userId,
      routineId: id,
      exerciseId,
      position: items.length,
      supersetGroup: null,
      targetSets: null,
      targetRepsLow: null,
      targetRepsHigh: null,
      targetRestSeconds: null,
      targetDurationSeconds: null,
      targetWeight: null,
      progressionIncrement: null,
      progressionStartedAt: null,
      notes: null,
      updatedAt: now,
      deviceId,
      deletedAt: null,
      serverSeq: 0,
    };
    await mutate("routineExercises", entity);
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
        <p className="text-sm text-zinc-500 dark:text-zinc-500">Loading…</p>
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
      <div className="flex items-start justify-between gap-2">
        <div>
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
        <Link
          href={`/routines/${routine.id}/edit`}
          aria-label="Edit routine"
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-zinc-500 dark:text-zinc-500"
        >
          <Pencil className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </Link>
      </div>

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

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext
          items={items.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <RoutineExerciseRowItem
                key={item.id}
                item={item}
                exerciseName={exercisesById.get(item.exerciseId)?.name ?? "Unknown exercise"}
                exerciseMechanic={exercisesById.get(item.exerciseId)?.mechanic ?? null}
                warmup={exercisesById.get(item.exerciseId)?.warmup ?? null}
                units={settings.units}
                onUpdate={(patch) => handleUpdateItem(item, patch)}
                onRemove={() => handleRemoveItem(item)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {items.length === 0 && (
        <p className="py-4 text-center text-sm text-zinc-500 dark:text-zinc-500">
          No exercises yet.
        </p>
      )}

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

      {pickerOpen && (
        <ExercisePicker
          userId={userId}
          excludeExerciseIds={excludeExerciseIds}
          initialCategory={isWarmupKind ? "warmup" : "all"}
          onPick={(exerciseId) => handleAddExercise(exerciseId)}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </main>
  );
}
