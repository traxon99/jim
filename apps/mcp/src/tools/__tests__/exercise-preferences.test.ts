import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserContext } from "../../context.js";
import { USER_A, USER_B, resetTestDb, testContext } from "../../test/test-db.js";
import { listExercisePreferences, setExercisePreferenceTool } from "../exercise-preferences.js";
import { mergeExercises } from "../merge-exercises.js";
import { searchExercisesTool } from "../search-exercises.js";
import { upsertExercise } from "../upsert-exercise.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)("exercise preference tools (#795)", () => {
  let admin: postgres.Sql;
  let context: UserContext;
  let otherContext: UserContext;
  let squatId: string;

  beforeAll(async () => {
    admin = await resetTestDb();
    context = testContext(USER_A);
    otherContext = testContext(USER_B);
    const rows = await admin<{ id: string; slug: string }[]>`
      INSERT INTO exercises (slug, name, tracking_type, primary_muscles) VALUES
        ('barbell-squat', 'Barbell Squat', 'weight_reps', '{quadriceps}'),
        ('leg-press', 'Leg Press', 'weight_reps', '{quadriceps}')
      RETURNING id, slug
    `;
    squatId = rows.find((r) => r.slug === "barbell-squat")?.id ?? "";
  });

  afterAll(async () => {
    await admin.end();
    await context.db.$client.end();
    await otherContext.db.$client.end();
  });

  it("sets a preference by name, previews without writing, and shows it in search", async () => {
    const preview = await setExercisePreferenceTool(context, {
      exercise: "leg press",
      preference: "dislike",
      dryRun: true,
    });
    expect(preview).toMatchObject({ previous: "none", preference: "dislike", dryRun: true });
    expect(await admin`SELECT id FROM exercise_preferences`).toHaveLength(0);

    await setExercisePreferenceTool(context, { exercise: "leg press", preference: "dislike" });
    await setExercisePreferenceTool(context, { exercise: squatId, preference: "like" });
    expect(await listExercisePreferences(context)).toEqual({
      liked: [{ id: squatId, name: "Barbell Squat" }],
      disliked: [expect.objectContaining({ name: "Leg Press" })],
    });
    const found = await searchExercisesTool(context, { query: "squat" });
    expect(found[0]).toMatchObject({ name: "Barbell Squat", preference: "like" });
    // Private: another user sees none.
    expect(await listExercisePreferences(otherContext)).toEqual({ liked: [], disliked: [] });
  });

  it("changes and clears, keeping one live row per exercise", async () => {
    await setExercisePreferenceTool(context, { exercise: "leg press", preference: "like" });
    await setExercisePreferenceTool(context, { exercise: "barbell squat", preference: "none" });
    const live = await admin<{ exercise_slug: string; preference: string }[]>`
      SELECT exercise_slug, preference FROM exercise_preferences WHERE deleted_at IS NULL
    `;
    expect(live).toEqual([{ exercise_slug: "leg-press", preference: "like" }]);
  });

  it("carries a merged exercise's preference to the kept one", async () => {
    const { id: mergeId } = await upsertExercise(context, {
      name: "My Squat",
      trackingType: "weight_reps",
      primaryMuscles: ["quadriceps"],
    });
    await setExercisePreferenceTool(context, { exercise: mergeId, preference: "dislike" });
    const result = await mergeExercises(context, { keepId: squatId, mergeId });
    expect(result.carriedPreference).toBe(true);
    expect((await listExercisePreferences(context)).disliked).toEqual([
      { id: squatId, name: "Barbell Squat" },
    ]);
  });
});
