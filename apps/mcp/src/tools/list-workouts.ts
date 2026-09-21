import { resolveCurrentRows, summarizeSession } from "@jim/core";
import { personalRecords, sessionExercises, sessions, sets } from "@jim/db";
import { and, desc, gte, inArray, isNull, lte } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUser } from "../context.js";

export interface ListWorkoutsInput {
  from?: string;
  to?: string;
  limit?: number;
}

export async function listWorkouts(context: UserContext, input: ListWorkoutsInput) {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);

  return withUser(context, async (tx) => {
    const conditions = [isNull(sessions.deletedAt)];
    if (input.from) conditions.push(gte(sessions.startedAt, new Date(input.from)));
    if (input.to) conditions.push(lte(sessions.startedAt, new Date(input.to)));

    const sessionRows = await tx
      .select()
      .from(sessions)
      .where(and(...conditions))
      .orderBy(desc(sessions.startedAt))
      .limit(limit);

    const finished = sessionRows.filter((session) => session.endedAt !== null);
    if (finished.length === 0) return [];

    const sessionIds = finished.map((session) => session.id);
    const exerciseRows = await tx
      .select()
      .from(sessionExercises)
      .where(
        and(inArray(sessionExercises.sessionId, sessionIds), isNull(sessionExercises.deletedAt)),
      );

    const sessionExerciseIds = exerciseRows.map((row) => row.id);
    const setRows = sessionExerciseIds.length
      ? resolveCurrentRows(
          await tx.select().from(sets).where(inArray(sets.sessionExerciseId, sessionExerciseIds)),
        ).filter((set) => !set.deletedAt)
      : [];

    const setIds = setRows.map((set) => set.id);
    const prRows = setIds.length
      ? await tx
          .select()
          .from(personalRecords)
          .where(and(inArray(personalRecords.setId, setIds), isNull(personalRecords.deletedAt)))
      : [];
    const prSetIds = new Set(prRows.map((pr) => pr.setId));

    const sessionExerciseIdsBySession = new Map<string, string[]>();
    for (const row of exerciseRows) {
      const list = sessionExerciseIdsBySession.get(row.sessionId);
      if (list) list.push(row.id);
      else sessionExerciseIdsBySession.set(row.sessionId, [row.id]);
    }
    const setsBySessionExercise = new Map<string, typeof setRows>();
    for (const set of setRows) {
      const list = setsBySessionExercise.get(set.sessionExerciseId);
      if (list) list.push(set);
      else setsBySessionExercise.set(set.sessionExerciseId, [set]);
    }

    return finished.map((session) => {
      const seIds = sessionExerciseIdsBySession.get(session.id) ?? [];
      const sessionSets = seIds.flatMap((id) => setsBySessionExercise.get(id) ?? []);
      const prCount = sessionSets.filter((set) => prSetIds.has(set.id)).length;

      const summary = summarizeSession(
        sessionSets.map((set) => ({
          weight: set.weight == null ? null : Number(set.weight),
          reps: set.reps,
        })),
        session.startedAt,
        session.endedAt as Date,
        prCount,
      );

      return {
        id: session.id,
        name: session.name,
        routineId: session.routineId,
        startedAt: session.startedAt.toISOString(),
        endedAt: (session.endedAt as Date).toISOString(),
        totalVolume: summary.totalVolume,
        durationSeconds: summary.durationSeconds,
        setCount: summary.setCount,
        prCount: summary.prCount,
      };
    });
  });
}
