import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserContext } from "../../context.js";
import { USER_A, USER_B, resetTestDb, testContext } from "../../test/test-db.js";
import { createRoutine } from "../create-routine.js";
import { getPrs } from "../get-prs.js";
import { getWorkout } from "../get-workout.js";
import { listWorkouts } from "../list-workouts.js";
import { logPastWorkout, setCompletionTimes } from "../log-past-workout.js";
import { upsertExercise } from "../upsert-exercise.js";

describe("setCompletionTimes", () => {
  it("spreads sets evenly, the last one finishing when the workout ends", () => {
    const start = new Date("2026-09-01T10:00:00Z");
    const end = new Date("2026-09-01T11:00:00Z");
    expect(setCompletionTimes(start, end, 3).map((d) => d.toISOString())).toEqual([
      "2026-09-01T10:20:00.000Z",
      "2026-09-01T10:40:00.000Z",
      "2026-09-01T11:00:00.000Z",
    ]);
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("log_past_workout (#244)", () => {
  let admin: postgres.Sql;
  let context: UserContext;

  beforeAll(async () => {
    admin = await resetTestDb();
    context = testContext(USER_A);
    await admin`
      INSERT INTO exercises (slug, name, tracking_type, primary_muscles) VALUES
        ('bench-press', 'Bench Press', 'weight_reps', '{chest}'),
        ('pull-up', 'Pull-Up', 'bodyweight', '{lats}')
    `;
  });

  afterAll(async () => {
    await admin.end();
    await context.db.$client.end();
  });

  it("logs a finished workout that list_workouts, get_workout and get_prs all see", async () => {
    const { id: routineId } = await createRoutine(context, {
      name: "Push Day",
      exercises: [{ exercise: "bench press" }],
    });
    const logged = await logPastWorkout(context, {
      startedAt: "2026-09-10T17:00:00Z",
      durationMinutes: 45,
      routineId,
      exercises: [
        {
          exercise: "bench press",
          sets: [
            { weight: 95, reps: 10, kind: "warmup" },
            { weight: 185, reps: 5, rpe: 8 },
            { weight: 185, reps: 5 },
          ],
        },
      ],
    });

    expect(logged).toMatchObject({
      name: "Push Day",
      endedAt: "2026-09-10T17:45:00.000Z",
      dryRun: false,
    });
    // The first working set sets every PR; the identical second one sets none.
    expect(logged.exercises[0]?.sets.map((set) => set.prs)).toEqual([
      [],
      ["1rm", "weight", "volume"],
      [],
    ]);

    const [row] =
      await admin`SELECT user_id, device_id, ended_at FROM sessions WHERE id = ${logged.id}`;
    expect(row).toMatchObject({ user_id: USER_A, device_id: "mcp-server" });

    const workouts = await listWorkouts(context, {});
    expect(workouts.find((w) => w.id === logged.id)).toMatchObject({
      totalVolume: logged.totalVolume,
      setCount: logged.setCount,
      prCount: 1,
    });
    const detail = await getWorkout(context, logged.id);
    expect(detail.exercises[0]?.sets).toHaveLength(3);
    const prs = await getPrs(context, { exercise: "bench press", kind: "weight" });
    expect(prs).toEqual([expect.objectContaining({ value: 185 })]);
  });

  it("compares a backdated workout only against lifts that came before it", async () => {
    // Earlier than the 185 above: 175 is still a PR at the time it happened.
    const earlier = await logPastWorkout(context, {
      startedAt: "2026-09-01T17:00:00Z",
      exercises: [{ exercise: "bench press", sets: [{ weight: 175, reps: 5 }] }],
    });
    expect(earlier.exercises[0]?.sets[0]?.prs).toContain("weight");

    // Later than it: 180 doesn't beat 185, so no weight PR.
    const later = await logPastWorkout(context, {
      startedAt: "2026-09-20T17:00:00Z",
      exercises: [{ exercise: "bench press", sets: [{ weight: 180, reps: 5 }] }],
    });
    expect(later.exercises[0]?.sets[0]?.prs).toEqual([]);

    // The current weight PR is still 185.
    const prs = await getPrs(context, { exercise: "bench press", kind: "weight" });
    expect(prs).toEqual([expect.objectContaining({ value: 185 })]);
  });

  it("never touches the session in progress on the phone", async () => {
    const [active] = await admin<{ id: string; updated_at: Date; server_seq: string }[]>`
      INSERT INTO sessions (user_id, device_id, started_at)
      VALUES (${USER_A}, 'phone', now() - interval '10 minutes')
      RETURNING id, updated_at, server_seq
    `;
    if (!active) throw new Error("expected the active session");
    await logPastWorkout(context, {
      startedAt: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
      exercises: [{ exercise: "pull-up", sets: [{ reps: 8 }, { reps: 10 }] }],
    });
    const [after] = await admin`
      SELECT ended_at, updated_at, server_seq, deleted_at FROM sessions WHERE id = ${active.id}
    `;
    expect(after).toMatchObject({
      ended_at: null,
      deleted_at: null,
      updated_at: active.updated_at,
      server_seq: active.server_seq,
    });
    const [{ count }] = (await admin`
      SELECT count(*)::int FROM session_exercises WHERE session_id = ${active.id}
    `) as unknown as [{ count: number }];
    expect(count).toBe(0);
  });

  it("refuses a workout that hasn't finished yet", async () => {
    await expect(
      logPastWorkout(context, {
        startedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
        exercises: [{ exercise: "bench press", sets: [{ weight: 135, reps: 5 }] }],
      }),
    ).rejects.toThrow(/already over/);
  });

  it("writes nothing on a dry run", async () => {
    const before =
      await admin`SELECT (SELECT count(*) FROM sessions) s, (SELECT count(*) FROM sets) t, (SELECT count(*) FROM personal_records) p`;
    const preview = await logPastWorkout(context, {
      startedAt: "2026-09-25T08:00:00Z",
      exercises: [{ exercise: "bench press", sets: [{ weight: 225, reps: 3 }] }],
      dryRun: true,
    });
    expect(preview).toMatchObject({ dryRun: true, prCount: 1 });
    const after =
      await admin`SELECT (SELECT count(*) FROM sessions) s, (SELECT count(*) FROM sets) t, (SELECT count(*) FROM personal_records) p`;
    expect(after).toEqual(before);
  });

  it("only reaches the calling user's own routines and exercises (RLS)", async () => {
    const other = testContext(USER_B);
    try {
      const { id: theirRoutine } = await createRoutine(other, { name: "B's", exercises: [] });
      const { id: theirExercise } = await upsertExercise(other, {
        name: "B's Secret Lift",
        trackingType: "weight_reps",
      });

      await expect(
        logPastWorkout(context, {
          startedAt: "2026-09-02T08:00:00Z",
          routineId: theirRoutine,
          exercises: [{ exercise: "bench press", sets: [{ weight: 100, reps: 5 }] }],
        }),
      ).rejects.toThrow(/No routine found/);
      await expect(
        logPastWorkout(context, {
          startedAt: "2026-09-02T08:00:00Z",
          exercises: [{ exercise: theirExercise, sets: [{ weight: 100, reps: 5 }] }],
        }),
      ).rejects.toThrow(/No exercise matches/);

      // And B's own logged workout isn't visible to A.
      const theirs = await logPastWorkout(other, {
        startedAt: "2026-09-02T08:00:00Z",
        exercises: [{ exercise: "bench press", sets: [{ weight: 100, reps: 5 }] }],
      });
      expect((await listWorkouts(context, {})).map((w) => w.id)).not.toContain(theirs.id);
    } finally {
      await other.db.$client.end();
    }
  });
});
