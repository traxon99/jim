import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserContext } from "../../context.js";
import { USER_A, resetTestDb, testContext } from "../../test/test-db.js";
import { createRoutine } from "../create-routine.js";
import { getRoutine } from "../get-routine.js";
import { updateRoutine } from "../update-routine.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)("custom progression rules over MCP (#255)", () => {
  let admin: postgres.Sql;
  let context: UserContext;

  const t1 = {
    type: "linear" as const,
    increment: 10,
    stages: [
      { sets: 5, reps: 3 },
      { sets: 6, reps: 2 },
      { sets: 10, reps: 1 },
    ],
    deload: { afterFailures: 1, pct: 0.15 },
  };
  const t3 = { type: "reps_sum" as const, increment: 5, repsSumTarget: 55 };

  beforeAll(async () => {
    admin = await resetTestDb();
    context = testContext(USER_A);
    await admin`
      INSERT INTO exercises (slug, name, tracking_type, primary_muscles) VALUES
        ('squat', 'Squat', 'weight_reps', '{quadriceps}'),
        ('lat-pulldown', 'Lat Pulldown', 'weight_reps', '{lats}'),
        ('bench-press', 'Bench Press', 'weight_reps', '{chest}')
    `;
    // Bench is focused in a running DPR block.
    await admin`UPDATE users SET dpr_enabled = true WHERE id = ${USER_A}`;
    const [block] = await admin<{ id: string }[]>`
      INSERT INTO dpr_blocks (user_id, started_at, weeks, ends_at, aggressiveness, experience)
      VALUES (${USER_A}, now() - interval '1 week', 8, now() + interval '7 weeks', 'moderate', 'intermediate')
      RETURNING id
    `;
    await admin`
      INSERT INTO dpr_block_lifts (user_id, block_id, exercise_id)
      SELECT ${USER_A}, ${block?.id ?? ""}, id FROM exercises WHERE slug = 'bench-press'
    `;
  });

  afterAll(async () => {
    await admin.end();
    await context.db.$client.end();
  });

  it("sets GZCLP rules on a routine and returns them from get_routine", async () => {
    const { id } = await createRoutine(context, {
      name: "GZCLP A1",
      exercises: [
        { exercise: "squat", targetSets: 5, targetRepsLow: 3, targetRepsHigh: 3, progression: t1 },
        {
          exercise: "lat pulldown",
          targetSets: 3,
          targetRepsLow: 15,
          targetRepsHigh: 15,
          progression: t3,
        },
      ],
    });
    const routine = await getRoutine(context, { routine: id });
    expect(routine.exercises[0]?.progression).toMatchObject(t1);
    expect(routine.exercises[1]?.progression).toMatchObject(t3);

    // Round-trips through update_routine unchanged.
    await updateRoutine(context, { routineId: id, exercises: routine.exercises });
    expect(await getRoutine(context, { routine: id })).toEqual(routine);
  });

  it("refuses a rule on a DPR-focused lift", async () => {
    await expect(
      createRoutine(context, {
        name: "Bench day",
        exercises: [{ exercise: "bench press", progression: t3 }],
      }),
    ).rejects.toThrow(/Bench Press: .*DPR/);
    expect(
      await createRoutine(context, {
        name: "Bench day",
        exercises: [{ exercise: "bench press" }],
      }),
    ).toMatchObject({ name: "Bench day" });
  });
});
