import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserContext } from "../../context.js";
import { USER_A, resetTestDb, testContext } from "../../test/test-db.js";
import { searchExercisesTool } from "../search-exercises.js";
import { upsertExercise } from "../upsert-exercise.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)("exercise muscle tags (#643)", () => {
  let admin: postgres.Sql;
  let context: UserContext;

  beforeAll(async () => {
    admin = await resetTestDb();
    context = testContext(USER_A);
  });

  afterAll(async () => {
    await admin.end();
    await context.db.$client.end();
  });

  it("refuses to create a strength exercise with no primary muscle", async () => {
    await expect(
      upsertExercise(context, { name: "Bench Press", trackingType: "weight_reps" }),
    ).rejects.toThrow(/primary muscle/);
    await expect(
      upsertExercise(context, {
        name: "Bench Press",
        trackingType: "weight_reps",
        primaryMuscles: [],
      }),
    ).rejects.toThrow(/primary muscle/);
  });

  it("drops a secondary muscle that is also primary", async () => {
    const { id } = await upsertExercise(context, {
      name: "Incline Chest Press",
      trackingType: "weight_reps",
      primaryMuscles: ["chest"],
      secondaryMuscles: ["chest", "shoulders", "triceps"],
    });
    const [found] = await searchExercisesTool(context, { query: "incline chest press" });
    expect(found).toMatchObject({
      id,
      primaryMuscles: ["chest"],
      secondaryMuscles: ["shoulders", "triceps"],
    });
  });

  it("refuses an edit that clears every primary muscle, but allows other edits", async () => {
    const { id } = await upsertExercise(context, {
      name: "Squat",
      trackingType: "weight_reps",
      primaryMuscles: ["quadriceps"],
    });
    await expect(upsertExercise(context, { id, primaryMuscles: [] })).rejects.toThrow(
      /primary muscle/,
    );

    // A row saved untagged before #643 can still be renamed, then tagged.
    await admin`UPDATE exercises SET primary_muscles = '{}' WHERE id = ${id}`;
    await expect(upsertExercise(context, { id, name: "Back Squat" })).resolves.toMatchObject({
      action: "updated",
    });
    await upsertExercise(context, {
      id,
      primaryMuscles: ["quadriceps", "glutes"],
      secondaryMuscles: ["glutes", "hamstrings"],
    });
    const [found] = await searchExercisesTool(context, { query: "back squat" });
    expect(found).toMatchObject({
      primaryMuscles: ["quadriceps", "glutes"],
      secondaryMuscles: ["hamstrings"],
    });
  });

  it("lets a warm-up stay untagged", async () => {
    await admin`
      INSERT INTO exercises (owner_id, slug, name, tracking_type, category)
      VALUES (${USER_A}, 'arm-circles', 'Arm Circles', 'bodyweight', 'warmup')
    `;
    const [warmup] = await admin<
      { id: string }[]
    >`SELECT id FROM exercises WHERE slug = 'arm-circles'`;
    await expect(
      // biome-ignore lint/style/noNonNullAssertion: just inserted
      upsertExercise(context, { id: warmup!.id, primaryMuscles: [] }),
    ).resolves.toMatchObject({ action: "updated" });
  });
});
