"use client";

import { type ProgramRoutineRow, type ProgramRow, type RoutineRow, db } from "@/lib/db/schema";
import { type NextWorkout, suggestNextWorkout } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";

export interface ProgramSuggestion {
  program: ProgramRow;
  next: NextWorkout<ProgramRoutineRow> | null;
  routine: RoutineRow | null;
}

/**
 * Live suggestion for a program — the active one when `programId` is
 * omitted. `undefined` while loading, `null` when there's no such program.
 */
export function useNextWorkout(programId?: string): ProgramSuggestion | null | undefined {
  return useLiveQuery(async () => {
    const program = programId
      ? await db.programs.get(programId)
      : (await db.programs.toArray()).find((p) => p.isActive && !p.deletedAt);
    if (!program || program.deletedAt) return null;

    const [allItems, sessions, routines] = await Promise.all([
      db.programRoutines.where("programId").equals(program.id).toArray(),
      db.sessions.toArray(),
      db.routines.toArray(),
    ]);
    // A routine deleted out from under the program just drops out of it.
    const liveRoutineIds = new Set(routines.filter((r) => !r.deletedAt).map((r) => r.id));
    const items = allItems.filter((item) => liveRoutineIds.has(item.routineId));

    const next = suggestNextWorkout({ mode: program.mode, items, sessions, now: new Date() });
    const routine = next ? (routines.find((r) => r.id === next.routineId) ?? null) : null;
    return { program, next, routine };
  }, [programId]);
}
