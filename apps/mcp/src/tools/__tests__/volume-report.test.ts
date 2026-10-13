import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserContext } from "../../context.js";
import { USER_A, resetTestDb, testContext } from "../../test/test-db.js";
import { logPastWorkout } from "../log-past-workout.js";
import { volumeReport } from "../volume-report.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)("volume_report categories (#516)", () => {
  let admin: postgres.Sql;
  let context: UserContext;

  beforeAll(async () => {
    admin = await resetTestDb();
    context = testContext(USER_A);
    await admin`
      INSERT INTO exercises (slug, name, tracking_type, primary_muscles, category)
      VALUES
        ('bench-press', 'Bench Press', 'weight_reps', '{chest}', 'strength'),
        ('bar-drill', 'Bar Drill', 'weight_reps', '{chest}', 'warmup')
    `;
    await logPastWorkout(context, {
      startedAt: "2026-09-10T17:00:00Z",
      exercises: [
        { exercise: "bench press", sets: [{ weight: 100, reps: 5 }] },
        { exercise: "bar drill", sets: [{ weight: 20, reps: 10 }] },
      ],
    });
  });

  afterAll(async () => {
    await admin.end();
    await context.db.$client.end();
  });

  const range = { from: "2026-09-01T00:00:00Z", to: "2026-09-30T00:00:00Z" };

  it("leaves warm-up exercises out of week and exercise totals", async () => {
    const weeks = await volumeReport(context, { ...range, groupBy: "week" });
    expect(weeks).toMatchObject([{ totalVolume: 500 }]);
    const byExercise = await volumeReport(context, { ...range, groupBy: "exercise" });
    expect(byExercise).toMatchObject([{ exerciseName: "Bench Press", totalVolume: 500 }]);
  });
});
