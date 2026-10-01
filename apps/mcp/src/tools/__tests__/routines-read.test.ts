import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserContext } from "../../context.js";
import { USER_A, USER_B, resetTestDb, testContext } from "../../test/test-db.js";
import { createRoutine } from "../create-routine.js";
import { getRoutine } from "../get-routine.js";
import { listRoutines } from "../list-routines.js";
import { updateRoutine } from "../update-routine.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)("list_routines / get_routine (#370)", () => {
  let admin: postgres.Sql;
  let context: UserContext;
  let otherContext: UserContext;
  let legsId: string;
  let pushId: string;

  beforeAll(async () => {
    admin = await resetTestDb();
    context = testContext(USER_A);
    otherContext = testContext(USER_B);
    await admin`
      INSERT INTO exercises (slug, name, tracking_type, primary_muscles) VALUES
        ('bench-press', 'Bench Press', 'weight_reps', '{chest}'),
        ('squat', 'Squat', 'weight_reps', '{quadriceps}'),
        ('plank', 'Plank', 'time', '{abdominals}')
    `;

    ({ id: legsId } = await createRoutine(context, {
      name: "Legs",
      folder: "PPL",
      exercises: [
        {
          exercise: "squat",
          targetSets: 4,
          targetRepsLow: 6,
          targetRepsHigh: 8,
          targetRestSeconds: 180,
          targetWeight: 100,
          notes: "Belt on top sets",
        },
        { exercise: "plank", targetSets: 3, targetDurationSeconds: 45, supersetGroup: 1 },
      ],
    }));
    ({ id: pushId } = await createRoutine(context, {
      name: "Push",
      folder: "PPL",
      exercises: [{ exercise: "bench press", targetSets: 3 }],
    }));
    const { id: deletedId } = await createRoutine(context, { name: "Old", exercises: [] });
    await admin`UPDATE routines SET deleted_at = now() WHERE id = ${deletedId}`;
    await createRoutine(otherContext, { name: "Someone else's", exercises: [] });

    await admin`
      INSERT INTO sessions (user_id, routine_id, name, started_at, ended_at, device_id) VALUES
        (${USER_A}, ${legsId}, 'Legs', '2026-09-20T10:00:00Z', '2026-09-20T11:00:00Z', 'test'),
        (${USER_A}, ${legsId}, 'Legs', '2026-09-27T10:00:00Z', '2026-09-27T11:00:00Z', 'test'),
        (${USER_A}, ${legsId}, 'Legs', '2026-09-30T10:00:00Z', NULL, 'test')
    `;
  });

  afterAll(async () => {
    await admin.end();
    await context.db.$client.end();
    await otherContext.db.$client.end();
  });

  it("list_routines returns every live routine of the user, logged or not", async () => {
    const result = await listRoutines(context, {});
    expect(result.map((r) => r.name).sort()).toEqual(["Legs", "Push"]);
    expect(result.find((r) => r.id === legsId)).toMatchObject({
      folder: "PPL",
      exerciseCount: 2,
      lastPerformedAt: "2026-09-27T10:00:00.000Z",
    });
    expect(result.find((r) => r.id === pushId)).toMatchObject({
      exerciseCount: 1,
      lastPerformedAt: null,
    });
  });

  it("list_routines filters by folder and name", async () => {
    expect(await listRoutines(context, { folder: "ppl", query: "leg" })).toHaveLength(1);
    expect(await listRoutines(context, { folder: "Upper/Lower" })).toEqual([]);
  });

  it("get_routine finds a routine by id or name and returns its ordered targets", async () => {
    const byName = await getRoutine(context, { routine: "legs" });
    const byId = await getRoutine(context, { routine: legsId });
    expect(byName).toEqual(byId);
    expect(byId.exercises.map((e) => e.exerciseName)).toEqual(["Squat", "Plank"]);
    expect(byId.exercises[0]).toMatchObject({
      targetSets: 4,
      targetRepsLow: 6,
      targetRepsHigh: 8,
      targetRestSeconds: 180,
      targetWeight: 100,
      notes: "Belt on top sets",
    });
    expect(byId.exercises[1]).not.toHaveProperty("targetRepsLow");
  });

  it("get_routine output round-trips through update_routine unchanged", async () => {
    const before = await getRoutine(context, { routine: legsId });
    await updateRoutine(context, { routineId: legsId, exercises: before.exercises });
    expect(await getRoutine(context, { routine: legsId })).toEqual(before);
  });

  it("get_routine can't see deleted routines or another user's", async () => {
    await expect(getRoutine(context, { routine: "Old" })).rejects.toThrow(/list_routines/);
    await expect(getRoutine(context, { routine: "Someone else's" })).rejects.toThrow(
      /list_routines/,
    );
    expect(await listRoutines(otherContext, {})).toHaveLength(1);
  });
});
