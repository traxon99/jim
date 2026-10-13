import { preferOwnedExercises, searchExercises } from "@jim/core";
import { type DbOrTx, exercises } from "@jim/db";
import { eq } from "drizzle-orm";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ExerciseNotFoundError extends Error {
  constructor(query: string, nearest: readonly string[] = []) {
    const suggestions =
      nearest.length > 0 ? ` Closest by equipment or muscle: ${nearest.join(", ")}.` : "";
    super(
      `No exercise matches "${query}".${suggestions} Try search_exercises to see what's in the catalog, or upsert_exercise to add it.`,
    );
  }
}

export type ExerciseRow = typeof exercises.$inferSelect;

/**
 * Every live exercise visible to this user under RLS: global seed rows plus
 * their own clones/custom rows (ADR-008). Archived rows (merged away, issue
 * #497) are left out, so a name never resolves to one.
 */
export async function visibleExercises(tx: DbOrTx): Promise<ExerciseRow[]> {
  return tx.select().from(exercises).where(eq(exercises.isArchived, false));
}

/**
 * Tool inputs name an exercise the way a person or an agent naturally would
 * — "bench press", not a UUID — so every tool that takes an `exercise`
 * parameter resolves it the same way: an exact id if one was given, else
 * the top `searchExercises` match among what this user can see, preferring
 * their own clone over the global row it was cloned from (ADR-008). Only a
 * name or alias match counts (issue #515): an equipment or muscle match
 * would quietly log to a different exercise, so it fails with suggestions.
 */
export async function resolveExercise(
  tx: DbOrTx,
  userId: string,
  query: string,
): Promise<ExerciseRow> {
  if (UUID_RE.test(query)) {
    const [row] = await tx.select().from(exercises).where(eq(exercises.id, query));
    if (!row) throw new ExerciseNotFoundError(query);
    if (row.isArchived) {
      throw new Error(
        `"${row.name}" is archived (merged into another exercise). Use search_exercises to find the one in use.`,
      );
    }
    return row;
  }

  const rows = await visibleExercises(tx);
  const candidates = preferOwnedExercises(rows, userId);
  const [best] = searchExercises(candidates, query, { namesOnly: true });
  if (!best) {
    const nearest = searchExercises(candidates, query)
      .slice(0, 3)
      .map((row) => row.name);
    throw new ExerciseNotFoundError(query, nearest);
  }

  return best;
}
