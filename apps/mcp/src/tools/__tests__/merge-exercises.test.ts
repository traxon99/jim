import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserContext } from "../../context.js";
import { withUser } from "../../context.js";
import { USER_A, resetTestDb, testContext } from "../../test/test-db.js";
import { mergeExercises } from "../merge-exercises.js";
import { resolveExercise } from "../resolve-exercise.js";
import { upsertExercise } from "../upsert-exercise.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)("merge_exercises (#497)", () => {
  let admin: postgres.Sql;
  let context: UserContext;
  let benchId: string;
  let plankId: string;
  let blockId: string;

  beforeAll(async () => {
    admin = await resetTestDb();
    context = testContext(USER_A);
    const rows = await admin<{ id: string; slug: string }[]>`
      INSERT INTO exercises (slug, name, tracking_type, primary_muscles) VALUES
        ('bench-press', 'Bench Press', 'weight_reps', '{chest}'),
        ('plank', 'Plank', 'time', '{abdominals}')
      RETURNING id, slug
    `;
    benchId = rows.find((r) => r.slug === "bench-press")?.id ?? "";
    plankId = rows.find((r) => r.slug === "plank")?.id ?? "";
    const [block] = await admin<{ id: string }[]>`
      INSERT INTO dpr_blocks (user_id, started_at, weeks, ends_at, aggressiveness, experience)
      VALUES (${USER_A}, now() - interval '1 week', 8, now() + interval '7 weeks', 'moderate', 'intermediate')
      RETURNING id
    `;
    blockId = block?.id ?? "";
  });

  afterAll(async () => {
    await admin.end();
    await context.db.$client.end();
  });

  it("moves a PRP block lift to the kept exercise and stops resolving the archived one", async () => {
    const { id: mergeId } = await upsertExercise(context, {
      name: "Flat Barbell Bench",
      trackingType: "weight_reps",
    });
    await admin`
      INSERT INTO dpr_block_lifts (user_id, block_id, exercise_id)
      VALUES (${USER_A}, ${blockId}, ${mergeId})
    `;

    const result = await mergeExercises(context, { keepId: benchId, mergeId });
    expect(result.repointedBlockLifts).toBe(1);

    const lifts = await admin<{ exercise_id: string }[]>`
      SELECT exercise_id FROM dpr_block_lifts WHERE block_id = ${blockId} AND deleted_at IS NULL
    `;
    expect(lifts.map((l) => l.exercise_id)).toEqual([benchId]);

    await expect(
      withUser(context, (tx) => resolveExercise(tx, USER_A, "flat barbell bench")),
    ).rejects.toThrow(/No exercise matches/);
    await expect(withUser(context, (tx) => resolveExercise(tx, USER_A, mergeId))).rejects.toThrow(
      /archived/,
    );
  });

  it("drops the merged lift when the block already has the kept one", async () => {
    const { id: mergeId } = await upsertExercise(context, {
      name: "Barbell Bench Variant",
      trackingType: "weight_reps",
    });
    await admin`
      INSERT INTO dpr_block_lifts (user_id, block_id, exercise_id)
      VALUES (${USER_A}, ${blockId}, ${mergeId})
    `;

    const result = await mergeExercises(context, { keepId: benchId, mergeId });
    expect(result.repointedBlockLifts).toBe(0);
    const lifts = await admin<{ exercise_id: string }[]>`
      SELECT exercise_id FROM dpr_block_lifts WHERE block_id = ${blockId} AND deleted_at IS NULL
    `;
    expect(lifts.map((l) => l.exercise_id)).toEqual([benchId]);
  });

  it("refuses to merge exercises with different tracking types", async () => {
    const { id: mergeId } = await upsertExercise(context, {
      name: "Weighted Plank",
      trackingType: "weight_reps",
    });
    await expect(mergeExercises(context, { keepId: plankId, mergeId })).rejects.toThrow(
      /can't be merged/,
    );
  });
});
