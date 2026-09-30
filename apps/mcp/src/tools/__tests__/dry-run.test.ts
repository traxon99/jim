import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserContext } from "../../context.js";
import { createMcpServer } from "../../server.js";
import { USER_A, resetTestDb, testContext } from "../../test/test-db.js";
import { createRoutine } from "../create-routine.js";
import { mergeExercises } from "../merge-exercises.js";
import { scheduleWorkout } from "../schedule-workout.js";
import { updateRoutine } from "../update-routine.js";
import { upsertExercise } from "../upsert-exercise.js";

/** Row counts per table, to prove a dry run wrote nothing. */
async function counts(admin: postgres.Sql) {
  const [row] = await admin<Record<string, string>[]>`
    SELECT
      (SELECT count(*) FROM routines) AS routines,
      (SELECT count(*) FROM routine_exercises WHERE deleted_at IS NULL) AS routine_exercises,
      (SELECT count(*) FROM scheduled_workouts) AS scheduled_workouts,
      (SELECT count(*) FROM exercises) AS exercises,
      (SELECT count(*) FROM exercises WHERE is_archived) AS archived_exercises,
      (SELECT string_agg(name, ',' ORDER BY id) FROM routines) AS routine_names
  `;
  return row;
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("dry_run on MCP write tools (#245)", () => {
  let admin: postgres.Sql;
  let context: UserContext;
  let benchId: string;
  let squatId: string;

  beforeAll(async () => {
    admin = await resetTestDb();
    context = testContext(USER_A);
    const rows = await admin<{ id: string; slug: string }[]>`
      INSERT INTO exercises (slug, name, tracking_type, primary_muscles) VALUES
        ('bench-press', 'Bench Press', 'weight_reps', '{chest}'),
        ('squat', 'Squat', 'weight_reps', '{quadriceps}')
      RETURNING id, slug
    `;
    benchId = rows.find((r) => r.slug === "bench-press")?.id ?? "";
    squatId = rows.find((r) => r.slug === "squat")?.id ?? "";
  });

  afterAll(async () => {
    await admin.end();
    await context.db.$client.end();
  });

  it("create_routine: a dry run writes nothing and previews what the real call writes", async () => {
    const input = {
      name: "Push Day",
      exercises: [{ exercise: "bench press", targetSets: 3 }, { exercise: "squat" }],
    };
    const before = await counts(admin);
    const preview = await createRoutine(context, { ...input, dryRun: true });
    expect(await counts(admin)).toEqual(before);

    const real = await createRoutine(context, input);
    expect(preview.dryRun).toBe(true);
    expect(real.dryRun).toBe(false);
    const shape = (r: typeof real) => ({
      name: r.name,
      exercises: r.exercises.map(({ exerciseId, exerciseName }) => ({ exerciseId, exerciseName })),
    });
    expect(shape(preview)).toEqual(shape(real));
    expect(shape(real).exercises.map((e) => e.exerciseId)).toEqual([benchId, squatId]);
  });

  it("update_routine: a dry run leaves the routine and its exercises untouched", async () => {
    const { id } = await createRoutine(context, {
      name: "Legs",
      exercises: [{ exercise: "squat" }, { exercise: "bench press" }],
    });
    const input = { routineId: id, name: "Leg Day", exercises: [{ exercise: "squat" }] };

    const before = await counts(admin);
    const preview = await updateRoutine(context, { ...input, dryRun: true });
    expect(await counts(admin)).toEqual(before);
    expect(preview).toMatchObject({ name: "Leg Day", removedExercises: 2, dryRun: true });

    const real = await updateRoutine(context, input);
    expect(real).toMatchObject({ name: "Leg Day", removedExercises: 2, dryRun: false });
  });

  it("schedule_workout: a dry run adds no scheduled workout", async () => {
    const { id } = await createRoutine(context, { name: "Pull", exercises: [] });
    const before = await counts(admin);
    const preview = await scheduleWorkout(context, {
      routineId: id,
      date: "2026-10-05T09:00:00.000Z",
      dryRun: true,
    });
    expect(await counts(admin)).toEqual(before);
    expect(preview).toMatchObject({ routineName: "Pull", dryRun: true });
  });

  it("upsert_exercise: a dry-run create or clone inserts nothing", async () => {
    const before = await counts(admin);
    const created = await upsertExercise(context, {
      name: "Cable Fly",
      trackingType: "weight_reps",
      dryRun: true,
    });
    const cloned = await upsertExercise(context, { id: benchId, name: "My Bench", dryRun: true });
    expect(await counts(admin)).toEqual(before);
    expect(created).toMatchObject({ action: "created", dryRun: true });
    expect(cloned).toMatchObject({ action: "cloned", dryRun: true });
  });

  it("merge_exercises: a dry run reports the same counts the real merge then repoints", async () => {
    const { id: mergeId } = await upsertExercise(context, {
      name: "Flat Bench",
      trackingType: "weight_reps",
    });
    await createRoutine(context, { name: "Chest", exercises: [{ exercise: mergeId }] });

    const before = await counts(admin);
    const preview = await mergeExercises(context, { keepId: benchId, mergeId, dryRun: true });
    expect(await counts(admin)).toEqual(before);

    const real = await mergeExercises(context, { keepId: benchId, mergeId });
    expect(preview.repointedRoutineExercises).toBe(1);
    const { dryRun: _p, ...previewCounts } = preview;
    const { dryRun: _r, ...realCounts } = real;
    expect(previewCounts).toEqual(realCounts);
  });

  it("the merge_exercises tool previews by default; other write tools commit by default", async () => {
    const server = createMcpServer(context);
    const client = new Client({ name: "test", version: "0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const { id: mergeId } = await upsertExercise(context, {
      name: "Box Squat",
      trackingType: "weight_reps",
    });
    const merge = await client.callTool({
      name: "merge_exercises",
      arguments: { keepId: squatId, mergeId },
    });
    expect(merge.isError).toBeFalsy();
    const [archived] = await admin`SELECT is_archived FROM exercises WHERE id = ${mergeId}`;
    expect(archived?.is_archived).toBe(false);

    const before = await counts(admin);
    await client.callTool({ name: "create_routine", arguments: { name: "Arms", exercises: [] } });
    expect(Number((await counts(admin))?.routines)).toBe(Number(before?.routines) + 1);

    await client.close();
    await server.close();
  });
});
