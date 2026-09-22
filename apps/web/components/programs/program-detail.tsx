"use client";

import { mutate } from "@/lib/db/mutate";
import { type ProgramRoutineRow, db } from "@/lib/db/schema";
import { setActiveProgram } from "@/lib/programs/set-active";
import { useNextWorkout } from "@/lib/programs/use-next-workout";
import { weekdaysFrom } from "@/lib/programs/weekdays";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { getDeviceId } from "@/lib/sync/engine";
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { reorderRoutineExercises, uuidv7 } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { ProgramRoutineRow as ProgramRoutineRowItem } from "./program-routine-row";

export function ProgramDetail({ id, userId }: { id: string; userId: string }) {
  const router = useRouter();

  const program = useLiveQuery(async () => (await db.programs.get(id)) ?? null, [id]);
  const rawItems = useLiveQuery(
    () => db.programRoutines.where("programId").equals(id).toArray(),
    [id],
  );
  const rawRoutines = useLiveQuery(() => db.routines.toArray(), []);
  const settings = useLiveQuery(() => db.settings.get("me"), []) ?? DEFAULT_SETTINGS;
  const suggestion = useNextWorkout(id);

  const routines = useMemo(
    () =>
      (rawRoutines ?? [])
        .filter((routine) => !routine.deletedAt)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [rawRoutines],
  );
  const routineNames = useMemo(
    () => new Map(routines.map((routine) => [routine.id, routine.name])),
    [routines],
  );

  const items = useMemo(
    () =>
      (rawItems ?? [])
        .filter((item) => !item.deletedAt && routineNames.has(item.routineId))
        .sort((a, b) => a.position - b.position),
    [rawItems, routineNames],
  );

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
      await mutate("programRoutines", {
        ...original,
        position: reorderedItem.position,
        updatedAt: now,
        deviceId,
      });
    }
  }

  async function handleAddRoutine(routineId: string) {
    if (!routineId) return;
    const deviceId = await getDeviceId();
    const entity: ProgramRoutineRow = {
      id: uuidv7(),
      userId,
      programId: id,
      routineId,
      position: items.length === 0 ? 0 : Math.max(...items.map((item) => item.position)) + 1,
      weekday: null,
      updatedAt: new Date(),
      deviceId,
      deletedAt: null,
      serverSeq: 0,
    };
    await mutate("programRoutines", entity);
  }

  async function handleUpdateItem(item: ProgramRoutineRow, patch: Partial<ProgramRoutineRow>) {
    const deviceId = await getDeviceId();
    await mutate("programRoutines", { ...item, ...patch, updatedAt: new Date(), deviceId });
  }

  async function handleRemoveItem(item: ProgramRoutineRow) {
    const deviceId = await getDeviceId();
    const now = new Date();
    await mutate("programRoutines", { ...item, deletedAt: now, updatedAt: now, deviceId });
  }

  async function handleDelete() {
    if (!program) return;
    if (!confirm(`Delete "${program.name}"? Its routines and past sessions are unaffected.`))
      return;
    const deviceId = await getDeviceId();
    const now = new Date();
    await mutate("programs", {
      ...program,
      isActive: false,
      deletedAt: now,
      updatedAt: now,
      deviceId,
    });
    for (const item of items) {
      await mutate("programRoutines", { ...item, deletedAt: now, updatedAt: now, deviceId });
    }
    router.push("/routines");
  }

  if (program === undefined || rawItems === undefined || rawRoutines === undefined) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-500">Loading…</p>
      </main>
    );
  }

  if (program === null || program.deletedAt) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-xl font-semibold">Program not found</h1>
        <Link href="/routines" className="text-sm font-medium underline underline-offset-4">
          Back to routines
        </Link>
      </main>
    );
  }

  const weekly = program.mode === "weekly";
  const nextItemId = suggestion?.next?.item.id;

  return (
    <main className="flex flex-1 flex-col gap-4 px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{program.name}</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            {weekly ? "Weekly schedule" : "Sequence"}
            {program.isActive && " · Active"}
          </p>
          {program.notes && (
            <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{program.notes}</p>
          )}
        </div>
        <Link
          href={`/routines/programs/${program.id}/edit`}
          className="shrink-0 text-sm font-medium underline underline-offset-4"
        >
          Edit
        </Link>
      </div>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {weekly
          ? "Pick a day for each routine. The Workout tab suggests today's, or the next one coming up."
          : "Routines run in this order. The Workout tab suggests the one after your last completed, looping back to the start."}
      </p>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext
          items={items.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="flex flex-col gap-2">
            {items.map((item, index) => (
              <ProgramRoutineRowItem
                key={item.id}
                item={item}
                routineName={routineNames.get(item.routineId) ?? "Unknown routine"}
                step={index + 1}
                weekly={weekly}
                weekdayOrder={weekdaysFrom(settings.weekStart)}
                isNext={item.id === nextItemId}
                onWeekdayChange={(weekday) => handleUpdateItem(item, { weekday })}
                onRemove={() => handleRemoveItem(item)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {items.length === 0 && (
        <p className="py-4 text-center text-sm text-zinc-500 dark:text-zinc-500">
          No routines in this program yet.
        </p>
      )}

      {routines.length === 0 ? (
        <Link
          href="/routines/new"
          data-ripple
          className="rounded-lg border border-zinc-300 px-4 py-3 text-center text-base font-medium dark:border-zinc-700"
        >
          Create a routine first
        </Link>
      ) : (
        <label className="flex flex-col gap-1 text-sm font-medium">
          Add routine
          <select
            value=""
            onChange={(event) => void handleAddRoutine(event.target.value)}
            className="min-h-11 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base font-normal text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="">Choose a routine…</option>
            {routines.map((routine) => (
              <option key={routine.id} value={routine.id}>
                {routine.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="mt-4 flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => void setActiveProgram(program.isActive ? null : program.id)}
          className="rounded-lg border border-zinc-300 px-4 py-3 text-base font-medium text-zinc-950 dark:border-zinc-700 dark:text-zinc-50"
        >
          {program.isActive ? "Stop suggesting from this program" : "Make active program"}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          className="rounded-lg border border-red-300 px-4 py-3 text-base font-medium text-red-600 dark:border-red-900 dark:text-red-500"
        >
          Delete
        </button>
      </div>
    </main>
  );
}
