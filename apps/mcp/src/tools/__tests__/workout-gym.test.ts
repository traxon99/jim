import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserContext } from "../../context.js";
import { USER_A, resetTestDb, testContext } from "../../test/test-db.js";
import { getWorkout } from "../get-workout.js";
import { createGym, deleteGym } from "../gyms.js";
import { listWorkouts } from "../list-workouts.js";
import { logPastWorkout } from "../log-past-workout.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)("a workout's gym (#454)", () => {
  let admin: postgres.Sql;
  let context: UserContext;

  beforeAll(async () => {
    admin = await resetTestDb();
    context = testContext(USER_A);
    await admin`
      INSERT INTO exercises (slug, name, tracking_type, primary_muscles)
      VALUES ('bench-press', 'Bench Press', 'weight_reps', '{chest}')
    `;
    await createGym(context, { name: "Iron Temple" });
  });

  afterAll(async () => {
    await admin.end();
    await context.db.$client.end();
  });

  const sets = [{ exercise: "bench press", sets: [{ weight: 135, reps: 8 }] }];

  it("logs a workout at a gym that get_workout and list_workouts report", async () => {
    const logged = await logPastWorkout(context, {
      startedAt: "2026-09-10T17:00:00Z",
      gym: "iron temple",
      exercises: sets,
    });
    expect(logged.gym).toMatchObject({ name: "Iron Temple" });
    expect((await getWorkout(context, logged.id)).gym).toMatchObject({ name: "Iron Temple" });
    const [listed] = await listWorkouts(context, {});
    expect(listed?.gym).toBe("Iron Temple");
  });

  it("leaves the gym empty when none is given, and rejects an unknown one", async () => {
    const logged = await logPastWorkout(context, {
      startedAt: "2026-09-11T17:00:00Z",
      exercises: sets,
    });
    expect((await getWorkout(context, logged.id)).gym).toBeNull();
    await expect(
      logPastWorkout(context, {
        startedAt: "2026-09-12T17:00:00Z",
        gym: "Nowhere",
        exercises: sets,
      }),
    ).rejects.toThrow(/No gym matches/);
  });

  it("reads a deleted gym as none", async () => {
    await deleteGym(context, { gym: "Iron Temple", dryRun: false });
    const workouts = await listWorkouts(context, {});
    expect(workouts.every((workout) => workout.gym === null)).toBe(true);
    const id = workouts.find((w) => w.startedAt.startsWith("2026-09-10"))?.id ?? "";
    expect((await getWorkout(context, id)).gym).toBeNull();
  });
});
