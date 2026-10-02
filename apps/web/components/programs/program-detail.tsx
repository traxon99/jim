"use client";

import { LoadingText } from "@/components/loading-text";
import { BackLink } from "@/components/page-header";
import { mutate } from "@/lib/db/mutate";
import { type ProgramRoutineRow, type RoutineRow, db } from "@/lib/db/schema";
import { pairWarmup } from "@/lib/programs/pair-warmup";
import { setActiveProgram } from "@/lib/programs/set-active";
import { useNextWorkout } from "@/lib/programs/use-next-workout";
import { weekdaysFrom } from "@/lib/programs/weekdays";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { getDeviceId } from "@/lib/sync/engine";
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  formatProgramWeek,
  isWarmupRoutine,
  programWeekProgress,
  reorderRoutineExercises,
  uuidv7,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { Layers } from "lucide-react";
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

  const liveRoutines = useMemo(
    () =>
      (rawRoutines ?? [])
        .filter((routine) => !routine.deletedAt)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [rawRoutines],
  );
  // Warm-ups aren't program steps of their own — they're paired with a
  // workout routine instead (issue #139).
  const routines = useMemo(
    () => liveRoutines.filter((routine) => !isWarmupRoutine(routine)),
    [liveRoutines],
  );
  const warmupRoutines = useMemo(() => liveRoutines.filter(isWarmupRoutine), [liveRoutines]);
  const routinesById = useMemo(
    () => new Map(liveRoutines.map((routine) => [routine.id, routine])),
    [liveRoutines],
  );

  const items = useMemo(
    () =>
      (rawItems ?? [])
        .filter(
          (item) =>
            !item.deletedAt && (item.routineId === null || routinesById.has(item.routineId)),
        )
        .sort((a, b) => a.position - b.position),
    [rawItems, routinesById],
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

  /** `routineId` null adds a rest day (issue #366). */
  async function handleAddRoutine(routineId: string | null) {
    if (routineId === "") return;
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

  async function handleWarmupChange(routine: RoutineRow, choice: string) {
    await pairWarmup(userId, routine, choice);
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
        <LoadingText />
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
  const weekProgress = program.isActive ? programWeekProgress(program, new Date()) : null;
  // On a sequence rest day the suggestion names the workout after the rest;
  // the rest day itself is what's up next in the list.
  const next = suggestion?.next;
  const nextIndex = next ? items.findIndex((item) => item.id === next.item.id) : -1;
  const restBefore =
    next?.reason === "rest" && nextIndex !== -1
      ? items[(nextIndex - 1 + items.length) % items.length]
      : undefined;
  const nextItemId = restBefore?.routineId === null ? restBefore.id : next?.item.id;
  let step = 0;

  return (
    <main className="flex flex-1 flex-col gap-4 px-4 py-4">
      <div className="self-start">
        <BackLink href="/routines" label="Routines" />
      </div>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Layers
              className="h-5 w-5 shrink-0 text-zinc-500 dark:text-zinc-500"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            {program.name}
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            {weekly ? "Weekly schedule" : "Sequence"}
            {program.isActive && " · Active"}
            {weekProgress && ` · ${formatProgramWeek(weekProgress)}`}
            {!weekProgress && program.durationWeeks && ` · ${program.durationWeeks} weeks`}
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
          ? "Pick a day for each routine. The Workout tab suggests today's, or the next one coming up. Pin rest days to keep them free."
          : "Routines run in this order. The Workout tab suggests the one after your last completed, looping back to the start. A rest day takes one day off before carrying on."}{" "}
        Pair a warm-up with any routine to run it at the start of that workout.
      </p>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext
          items={items.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="flex flex-col gap-2">
            {items.map((item) => {
              const routine = item.routineId ? routinesById.get(item.routineId) : null;
              if (routine === undefined) return null;
              const isWarmup = routine !== null && isWarmupRoutine(routine);
              if (!isWarmup) step += 1;
              return (
                <ProgramRoutineRowItem
                  key={item.id}
                  item={item}
                  routine={routine}
                  isWarmup={isWarmup}
                  warmupName={
                    routine?.warmupRoutineId
                      ? routinesById.get(routine.warmupRoutineId)?.name
                      : undefined
                  }
                  warmupRoutines={warmupRoutines}
                  step={step}
                  weekly={weekly}
                  weekdayOrder={weekdaysFrom(settings.weekStart)}
                  isNext={item.id === nextItemId}
                  onWeekdayChange={(weekday) => handleUpdateItem(item, { weekday })}
                  onWarmupChange={(choice) => {
                    if (routine) void handleWarmupChange(routine, choice);
                  }}
                  onRemove={() => handleRemoveItem(item)}
                />
              );
            })}
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
            onChange={(event) =>
              void handleAddRoutine(event.target.value === "rest" ? null : event.target.value)
            }
            className="min-h-11 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base font-normal text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="">Choose a routine…</option>
            <option value="rest">Rest day</option>
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
