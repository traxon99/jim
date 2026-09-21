import { type PersonalRecordEntry, type PrKind, currentPersonalRecords } from "@jim/core";
import { exercises, personalRecords } from "@jim/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUser } from "../context.js";
import { resolveExercise } from "./resolve-exercise.js";

export interface GetPrsInput {
  exercise?: string;
  kind?: PrKind;
}

export async function getPrs(context: UserContext, input: GetPrsInput) {
  return withUser(context, async (tx) => {
    const conditions = [isNull(personalRecords.deletedAt)];

    if (input.exercise) {
      const exercise = await resolveExercise(tx, context.userId, input.exercise);
      conditions.push(eq(personalRecords.exerciseId, exercise.id));
    }
    if (input.kind) conditions.push(eq(personalRecords.kind, input.kind));

    const rows = await tx
      .select()
      .from(personalRecords)
      .where(and(...conditions));

    const entries: PersonalRecordEntry[] = rows.map((row) => ({
      id: row.id,
      exerciseId: row.exerciseId,
      kind: row.kind,
      value: Number(row.value),
      achievedAt: row.achievedAt,
    }));
    const current = currentPersonalRecords(entries);

    const exerciseIds = [...new Set(current.map((pr) => pr.exerciseId))];
    const exerciseNames = exerciseIds.length
      ? new Map(
          (await tx.select().from(exercises).where(inArray(exercises.id, exerciseIds))).map((e) => [
            e.id,
            e.name,
          ]),
        )
      : new Map<string, string>();

    return current
      .sort((a, b) => b.achievedAt.getTime() - a.achievedAt.getTime())
      .map((pr) => ({
        exerciseId: pr.exerciseId,
        exerciseName: exerciseNames.get(pr.exerciseId) ?? "Unknown exercise",
        kind: pr.kind,
        value: pr.value,
        achievedAt: pr.achievedAt.toISOString(),
      }));
  });
}
