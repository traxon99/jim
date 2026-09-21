import { preferOwnedExercises, searchExercises } from "@jim/core";
import { type DbOrTx, exercises } from "@jim/db";
import { eq } from "drizzle-orm";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ExerciseNotFoundError extends Error {
  constructor(query: string) {
    super(`No exercise matches "${query}". Try search_exercises to see what's in the catalog.`);
  }
}

export type ExerciseRow = typeof exercises.$inferSelect;

/** Every exercise visible to this user under RLS: global seed rows plus their own clones/custom rows (ADR-008). */
export async function visibleExercises(tx: DbOrTx): Promise<ExerciseRow[]> {
  return tx.select().from(exercises);
}

/**
 * Tool inputs name an exercise the way a person or an agent naturally would
 * — "bench press", not a UUID — so every tool that takes an `exercise`
 * parameter resolves it the same way: an exact id if one was given, else
 * the top `searchExercises` match among what this user can see, preferring
 * their own clone over the global row it was cloned from (ADR-008).
 */
export async function resolveExercise(
  tx: DbOrTx,
  userId: string,
  query: string,
): Promise<ExerciseRow> {
  if (UUID_RE.test(query)) {
    const [row] = await tx.select().from(exercises).where(eq(exercises.id, query));
    if (!row) throw new ExerciseNotFoundError(query);
    return row;
  }

  const rows = await visibleExercises(tx);
  const candidates = preferOwnedExercises(rows, userId);
  const [best] = searchExercises(candidates, query);
  if (!best) throw new ExerciseNotFoundError(query);

  return best;
}
