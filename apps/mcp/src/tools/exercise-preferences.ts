import {
  type ExercisePreference,
  buildExercisePreferenceMap,
  preferOwnedExercises,
  uuidv7,
} from "@jim/core";
import { type DbOrTx, exercisePreferences } from "@jim/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUser, withUserWrite } from "../context.js";
import { MCP_DEVICE_ID } from "./create-routine.js";
import { resolveExercise, visibleExercises } from "./resolve-exercise.js";

/**
 * Exercise preference (issue #795, CONTEXT.md): the user's Like or Dislike
 * on an exercise, by slug, the same as the exercise sheet's Like / None /
 * Dislike. Liked lifts are favoured when building workouts and programs;
 * disliked ones are never picked, though the user can still add them.
 */

/** Slug → Like/Dislike for this user. */
export async function loadPreferences(tx: DbOrTx): Promise<Map<string, ExercisePreference>> {
  return buildExercisePreferenceMap(await tx.select().from(exercisePreferences));
}

export async function listExercisePreferences(context: UserContext) {
  return withUser(context, async (tx) => {
    const preferences = await loadPreferences(tx);
    const rows = preferOwnedExercises(await visibleExercises(tx), context.userId);
    const liked: { id: string; name: string }[] = [];
    const disliked: { id: string; name: string }[] = [];
    for (const row of rows) {
      const preference = preferences.get(row.slug);
      if (preference === "like") liked.push({ id: row.id, name: row.name });
      if (preference === "dislike") disliked.push({ id: row.id, name: row.name });
    }
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    return { liked: liked.sort(byName), disliked: disliked.sort(byName) };
  });
}

export interface SetExercisePreferenceInput {
  /** An exercise id or name. */
  exercise: string;
  preference: ExercisePreference | "none";
  dryRun?: boolean;
}

export async function setExercisePreferenceTool(
  context: UserContext,
  input: SetExercisePreferenceInput,
) {
  return withUserWrite(context, input.dryRun ?? false, async (tx) => {
    const exercise = await resolveExercise(tx, context.userId, input.exercise);
    const slug = exercise.slug;
    const previous = (await loadPreferences(tx)).get(slug) ?? "none";
    const now = new Date();
    const live = and(
      eq(exercisePreferences.exerciseSlug, slug),
      isNull(exercisePreferences.deletedAt),
    );
    const tombstone = {
      deletedAt: now,
      updatedAt: now,
      deviceId: MCP_DEVICE_ID,
      serverSeq: sql`nextval('sync_seq')`,
    };

    if (input.preference !== previous) {
      // One live row per slug: retire what's there, then write the new one.
      await tx.update(exercisePreferences).set(tombstone).where(live);
      if (input.preference !== "none") {
        await tx.insert(exercisePreferences).values({
          id: uuidv7(),
          userId: context.userId,
          exerciseSlug: slug,
          preference: input.preference,
          createdAt: now,
          updatedAt: now,
          deviceId: MCP_DEVICE_ID,
        });
      }
    }
    return {
      exercise: { id: exercise.id, name: exercise.name },
      previous,
      preference: input.preference,
    };
  });
}

/**
 * merge_exercises: the merged-away exercise's preference moves to the kept
 * one, unless the kept one already has its own. Returns whether it moved.
 */
export async function carryPreference(
  tx: DbOrTx,
  userId: string,
  fromSlug: string,
  toSlug: string,
  now: Date,
): Promise<boolean> {
  if (fromSlug === toSlug) return false;
  const preferences = await loadPreferences(tx);
  const preference = preferences.get(fromSlug);
  if (!preference || preferences.has(toSlug)) return false;
  await tx.insert(exercisePreferences).values({
    id: uuidv7(),
    userId,
    exerciseSlug: toSlug,
    preference,
    createdAt: now,
    updatedAt: now,
    deviceId: MCP_DEVICE_ID,
  });
  return true;
}
