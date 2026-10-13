import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserContext } from "../../context.js";
import { USER_A, USER_B, resetTestDb, testContext } from "../../test/test-db.js";
import { deleteWorkout } from "../delete-workout.js";
import { exerciseHistory } from "../exercise-history.js";
import { logPastWorkout } from "../log-past-workout.js";
import { volumeReport } from "../volume-report.js";

// volume_report and exercise_history against real rows (issue #541): only
// working sets count as volume, a deleted workout counts for nothing, and
// another user's lifts never show up.
describe.skipIf(!process.env.TEST_DATABASE_URL)("volume_report and exercise_history", () => {
  let admin: postgres.Sql;
  let context: UserContext;
  let other: UserContext;

  beforeAll(async () => {
    admin = await resetTestDb();
    context = testContext(USER_A);
    other = testContext(USER_B);
    await admin`
      INSERT INTO exercises (slug, name, tracking_type, primary_muscles, secondary_muscles) VALUES
        ('bench-press', 'Bench Press', 'weight_reps', '{chest}', '{triceps}'),
        ('back-squat', 'Back Squat', 'weight_reps', '{quadriceps}', '{}')
    `;

    await logPastWorkout(context, {
      startedAt: "2026-09-08T17:00:00Z",
      exercises: [
        {
          exercise: "bench press",
          sets: [
            { weight: 50, reps: 10, kind: "warmup" },
            { weight: 100, reps: 5 },
            { weight: 100, reps: 5 },
          ],
        },
        { exercise: "back squat", sets: [{ weight: 140, reps: 5 }] },
      ],
    });
    await logPastWorkout(context, {
      startedAt: "2026-09-16T17:00:00Z",
      exercises: [{ exercise: "bench press", sets: [{ weight: 110, reps: 5 }] }],
    });
    const deleted = await logPastWorkout(context, {
      startedAt: "2026-09-18T17:00:00Z",
      exercises: [{ exercise: "bench press", sets: [{ weight: 300, reps: 5 }] }],
    });
    await deleteWorkout(context, { sessionId: deleted.id });
    await logPastWorkout(other, {
      startedAt: "2026-09-10T17:00:00Z",
      exercises: [{ exercise: "bench press", sets: [{ weight: 200, reps: 5 }] }],
    });
  });

  afterAll(async () => {
    await admin.end();
    await context.db.$client.end();
    await other.db.$client.end();
  });

  const range = { from: "2026-09-01T00:00:00Z", to: "2026-09-30T23:59:59Z" };

  it("totals working-set volume per exercise, heaviest first", async () => {
    const report = await volumeReport(context, { ...range, groupBy: "exercise" });
    expect(report).toEqual([
      expect.objectContaining({ exerciseName: "Bench Press", totalVolume: 1550 }),
      expect.objectContaining({ exerciseName: "Back Squat", totalVolume: 700 }),
    ]);
  });

  it("totals volume per week", async () => {
    const report = (await volumeReport(context, { ...range, groupBy: "week" })) as {
      weekStart: string;
      totalVolume: number;
    }[];
    const totals = [...report]
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
      .map((week) => week.totalVolume);
    expect(totals).toEqual([1700, 550]);
  });

  it("counts sets per muscle, secondary muscles included", async () => {
    const report = (await volumeReport(context, { ...range, groupBy: "muscle" })) as {
      setsByMuscle: Record<string, number>;
    }[];
    const sum = (muscle: string) =>
      report.reduce((total, week) => total + (week.setsByMuscle[muscle] ?? 0), 0);
    expect(sum("chest")).toBe(3);
    expect(sum("quadriceps")).toBe(1);
  });

  it("lists an exercise's sets oldest first, leaving out a deleted workout", async () => {
    const history = await exerciseHistory(context, { exercise: "bench press" });
    expect(history.sets.map((set) => [set.kind, set.weight])).toEqual([
      ["warmup", 50],
      ["working", 100],
      ["working", 100],
      ["working", 110],
    ]);
    expect(history.estimatedOneRepMaxSeries).toHaveLength(2);
  });

  it("filters history by date", async () => {
    const history = await exerciseHistory(context, {
      exercise: "bench press",
      from: "2026-09-15T00:00:00Z",
    });
    expect(history.sets.map((set) => set.weight)).toEqual([110]);
  });
});
