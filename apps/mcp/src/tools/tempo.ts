import {
  exerciseDisplayName,
  isCardioExercise,
  isWarmupExercise,
  isWarmupRoutine,
} from "@jim/core";
import { type DbOrTx, exercises, programRoutines, routineExercises, routines } from "@jim/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUserWrite } from "../context.js";
import { MCP_DEVICE_ID, routineTempo } from "./create-routine.js";
import { findRoutine } from "./find-routine.js";
import { findProgram } from "./programs.js";
import { resolveExercise } from "./resolve-exercise.js";

export interface SetTempoInput {
  /** A routine id or exact name. Exactly one of routine / program. */
  routine?: string;
  /** A program id or exact name: every routine in it. */
  program?: string;
  /** The same tempo on every lift in scope; null or "" clears them all. */
  tempo?: string | null;
  /** Per-lift tempos, applied after `tempo`. */
  exercises?: { exercise: string; tempo: string | null; routine?: string }[];
  dryRun?: boolean;
}

interface Lift {
  id: string;
  routineId: string;
  routineName: string;
  exerciseId: string;
  name: string;
  tempo: string | null;
}

/** The routines a program runs, in order, each once; rest days and warm-ups left out. */
async function programRoutineIds(tx: DbOrTx, programId: string): Promise<string[]> {
  const rows = await tx
    .select({ routineId: programRoutines.routineId, position: programRoutines.position })
    .from(programRoutines)
    .where(and(eq(programRoutines.programId, programId), isNull(programRoutines.deletedAt)))
    .orderBy(programRoutines.position);
  return [...new Set(rows.flatMap((row) => (row.routineId ? [row.routineId] : [])))];
}

/**
 * Every lift's tempo in a routine or a program (issue #850), the tool for
 * the phone's Tempo sheet: one tempo on all lifts and/or one per lift.
 * Warm-up routines and warm-up and cardio exercises take no tempo.
 */
export async function setTempo(context: UserContext, input: SetTempoInput) {
  if ((input.routine == null) === (input.program == null)) {
    throw new Error("Pass exactly one of routine or program.");
  }
  if (input.tempo === undefined && !input.exercises?.length) {
    throw new Error("Pass tempo (for every lift), exercises (per lift), or both.");
  }
  return withUserWrite(context, input.dryRun ?? false, async (tx) => {
    const scope = input.routine
      ? { routine: await findRoutine(tx, input.routine) }
      : { program: await findProgram(tx, input.program as string) };
    const routineIds = scope.routine
      ? [scope.routine.id]
      : await programRoutineIds(tx, scope.program.id);

    const routineRows = routineIds.length
      ? await tx
          .select()
          .from(routines)
          .where(and(inArray(routines.id, routineIds), isNull(routines.deletedAt)))
      : [];
    const routinesById = new Map(
      routineRows.filter((row) => !isWarmupRoutine(row)).map((row) => [row.id, row]),
    );
    const itemRows = routinesById.size
      ? await tx
          .select({ item: routineExercises, exercise: exercises })
          .from(routineExercises)
          .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
          .where(
            and(
              inArray(routineExercises.routineId, [...routinesById.keys()]),
              isNull(routineExercises.deletedAt),
            ),
          )
          .orderBy(routineExercises.position)
      : [];

    const lifts: Lift[] = [];
    for (const routineId of routineIds) {
      const routine = routinesById.get(routineId);
      if (!routine) continue;
      for (const { item, exercise } of itemRows) {
        if (item.routineId !== routineId) continue;
        if (isWarmupExercise(exercise) || isCardioExercise(exercise)) continue;
        lifts.push({
          id: item.id,
          routineId,
          routineName: routine.name,
          exerciseId: exercise.id,
          name: exerciseDisplayName(exercise),
          tempo: item.tempo,
        });
      }
    }
    if (lifts.length === 0) {
      throw new Error("No lifts to set a tempo on: warm-up and cardio exercises take none.");
    }

    const next = new Map(lifts.map((lift) => [lift.id, lift.tempo]));
    if (input.tempo !== undefined) {
      const tempo = routineTempo(input.tempo, "every lift");
      for (const lift of lifts) next.set(lift.id, tempo);
    }
    for (const entry of input.exercises ?? []) {
      const inRoutine = entry.routine
        ? lifts.filter(
            (lift) =>
              lift.routineId === entry.routine ||
              lift.routineName.toLowerCase() === entry.routine?.trim().toLowerCase(),
          )
        : lifts;
      const key = entry.exercise.trim().toLowerCase();
      let matches = inRoutine.filter(
        (lift) => lift.exerciseId === entry.exercise.trim() || lift.name.toLowerCase() === key,
      );
      if (matches.length === 0) {
        const exercise = await resolveExercise(tx, context.userId, entry.exercise).catch(
          () => null,
        );
        if (exercise) matches = inRoutine.filter((lift) => lift.exerciseId === exercise.id);
      }
      if (matches.length === 0) {
        const names = [...new Set(inRoutine.map((lift) => lift.name))].join(", ");
        throw new Error(`"${entry.exercise}" isn't a lift here. The lifts are: ${names}.`);
      }
      const tempo = routineTempo(entry.tempo, matches[0]?.name ?? entry.exercise);
      for (const lift of matches) next.set(lift.id, tempo);
    }

    const now = new Date();
    let changed = 0;
    for (const lift of lifts) {
      const tempo = next.get(lift.id) ?? null;
      if (tempo === lift.tempo) continue;
      changed += 1;
      await tx
        .update(routineExercises)
        .set({
          tempo,
          updatedAt: now,
          deviceId: MCP_DEVICE_ID,
          serverSeq: sql`nextval('sync_seq')`,
        })
        .where(eq(routineExercises.id, lift.id));
    }

    const byRoutine = new Map<
      string,
      {
        routineId: string;
        routineName: string;
        lifts: { exercise: string; tempo: string | null }[];
      }
    >();
    for (const lift of lifts) {
      const group = byRoutine.get(lift.routineId) ?? {
        routineId: lift.routineId,
        routineName: lift.routineName,
        lifts: [],
      };
      group.lifts.push({ exercise: lift.name, tempo: next.get(lift.id) ?? null });
      byRoutine.set(lift.routineId, group);
    }
    return { changed, routines: [...byRoutine.values()] };
  });
}
