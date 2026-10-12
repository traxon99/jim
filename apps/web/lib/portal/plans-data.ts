import type {
  ExerciseRow,
  ProgramRoutineRow,
  ProgramRow,
  RoutineExerciseRow,
  RoutineRow,
  SessionRow,
} from "@/lib/db/schema";
import { lastDoneByRoutine } from "@/lib/routines/last-done";
import { routineItemSummary } from "@/lib/routines/summary";
import { exerciseDisplayName, isCardioExercise, isWarmupExercise, supersetLabels } from "@jim/core";

/** One exercise in a routine, with its targets already summarized. */
export interface PortalRoutineItem {
  id: string;
  exerciseId: string;
  name: string;
  /** e.g. "3 × 5–7 · 185 lb · 2:00 rest", or null with no targets set. */
  summary: string | null;
  /** "A1", "A2" for supersets. */
  supersetLabel: string | null;
  notes: string | null;
}

export interface PortalRoutine {
  id: string;
  name: string;
  notes: string | null;
  folder: string | null;
  position: number;
  kind: RoutineRow["kind"];
  iconShape: RoutineRow["iconShape"];
  iconColor: RoutineRow["iconColor"];
  warmupRoutineId: string | null;
  lastDoneAt: string | null;
  items: PortalRoutineItem[];
}

export interface PortalProgram {
  id: string;
  name: string;
  mode: ProgramRow["mode"];
  isActive: boolean;
  notes: string | null;
  durationWeeks: number | null;
  activatedAt: string | null;
  /** In order; `routineId: null` is a rest day. */
  items: { id: string; routineId: string | null; weekday: number | null }[];
}

export interface PortalScheduledWorkout {
  id: string;
  routineId: string | null;
  scheduledFor: string;
  notes: string | null;
}

/** What the desktop Routines section (issue #470) shows. */
export interface PortalPlansData {
  units: "lb" | "kg";
  weekStart: number;
  routines: PortalRoutine[];
  programs: PortalProgram[];
  /** Every live scheduled workout, soonest first; the page keeps the upcoming ones. */
  scheduled: PortalScheduledWorkout[];
}

/**
 * Routines with their exercises and targets, programs with their schedule,
 * and scheduled workouts, as the phone's Routines and program screens read
 * them. Deleted rows (tombstones) are left out.
 */
export function buildPortalPlansData({
  units,
  weekStart,
  routines,
  routineExercises,
  exercises,
  programs,
  programRoutines,
  sessions,
  scheduled,
}: {
  units: "lb" | "kg";
  weekStart: number;
  routines: readonly RoutineRow[];
  routineExercises: readonly RoutineExerciseRow[];
  exercises: readonly ExerciseRow[];
  programs: readonly ProgramRow[];
  programRoutines: readonly ProgramRoutineRow[];
  sessions: readonly Pick<SessionRow, "routineId" | "startedAt" | "endedAt" | "deletedAt">[];
  scheduled: readonly {
    id: string;
    routineId: string | null;
    scheduledFor: Date;
    notes: string | null;
    deletedAt: Date | null;
  }[];
}): PortalPlansData {
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const lastDone = lastDoneByRoutine(sessions);
  const itemsByRoutine = new Map<string, RoutineExerciseRow[]>();
  for (const item of routineExercises) {
    if (item.deletedAt) continue;
    const list = itemsByRoutine.get(item.routineId) ?? [];
    list.push(item);
    itemsByRoutine.set(item.routineId, list);
  }

  const liveRoutines = routines.filter((routine) => !routine.deletedAt);
  const liveRoutineIds = new Set(liveRoutines.map((routine) => routine.id));

  return {
    units,
    weekStart,
    routines: liveRoutines.map((routine) => {
      const items = (itemsByRoutine.get(routine.id) ?? []).sort((a, b) => a.position - b.position);
      const labels = supersetLabels(items);
      return {
        id: routine.id,
        name: routine.name,
        notes: routine.notes,
        folder: routine.folder,
        position: routine.position,
        kind: routine.kind,
        iconShape: routine.iconShape,
        iconColor: routine.iconColor,
        warmupRoutineId:
          routine.warmupRoutineId && liveRoutineIds.has(routine.warmupRoutineId)
            ? routine.warmupRoutineId
            : null,
        lastDoneAt: lastDone.get(routine.id)?.toISOString() ?? null,
        items: items.map((item) => {
          const exercise = exerciseById.get(item.exerciseId);
          const timed =
            !!exercise &&
            ((isWarmupExercise(exercise) && exercise.trackingType === "time") ||
              isCardioExercise(exercise));
          return {
            id: item.id,
            exerciseId: item.exerciseId,
            name: exercise ? exerciseDisplayName(exercise) : "Exercise",
            summary: routineItemSummary(item, units, timed),
            supersetLabel: labels.get(item.id) ?? null,
            notes: item.notes,
          };
        }),
      };
    }),
    programs: programs
      .filter((program) => !program.deletedAt)
      .sort((a, b) => a.position - b.position)
      .map((program) => ({
        id: program.id,
        name: program.name,
        mode: program.mode,
        isActive: program.isActive,
        notes: program.notes,
        durationWeeks: program.durationWeeks,
        activatedAt: program.activatedAt?.toISOString() ?? null,
        items: programRoutines
          .filter(
            (item) =>
              item.programId === program.id &&
              !item.deletedAt &&
              (item.routineId === null || liveRoutineIds.has(item.routineId)),
          )
          .sort((a, b) => a.position - b.position)
          .map((item) => ({ id: item.id, routineId: item.routineId, weekday: item.weekday })),
      })),
    scheduled: scheduled
      .filter((entry) => !entry.deletedAt)
      .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())
      .map((entry) => ({
        id: entry.id,
        routineId: entry.routineId && liveRoutineIds.has(entry.routineId) ? entry.routineId : null,
        scheduledFor: entry.scheduledFor.toISOString(),
        notes: entry.notes,
      })),
  };
}
