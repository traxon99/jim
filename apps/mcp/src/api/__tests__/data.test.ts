import {
  addWeeks,
  startOfWeek,
  trainingStreak,
  uuidv7,
  v1BodyMeasurementsSchema,
  v1DprSchema,
  v1ErrorSchema,
  v1LiftsSchema,
  v1PlanSchema,
  v1PrsSchema,
  v1StreakSchema,
  v1WeeksSchema,
  v1WorkoutSchema,
  v1WorkoutsSchema,
} from "@jim/core";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserContext } from "../../context.js";
import { getDb } from "../../db.js";
import { USER_A, USER_B, resetTestDb } from "../../test/test-db.js";
import { logBodyMeasurement } from "../../tools/body-measurements-write.js";
import { createRoutine } from "../../tools/create-routine.js";
import { exerciseHistory } from "../../tools/exercise-history.js";
import { getPrs } from "../../tools/get-prs.js";
import { listWorkouts } from "../../tools/list-workouts.js";
import { logPastWorkout } from "../../tools/log-past-workout.js";
import { createProgram } from "../../tools/programs.js";
import { scheduleWorkout } from "../../tools/schedule-workout.js";
import { weeklySummary } from "../../tools/weekly-summary.js";
import { v1Plan } from "../plan.js";
import { dayIn } from "../zone.js";
import { insertToken, startV1 } from "./v1-helpers.js";

const DAY_MS = 86_400_000;
const ZONE = "America/Chicago";

describe.skipIf(!process.env.TEST_DATABASE_URL)("/v1 data endpoints (#738–#742)", () => {
  let admin: postgres.Sql;
  let api: Awaited<ReturnType<typeof startV1>>;
  let context: UserContext;
  let token: string;
  let tokenB: string;
  const now = new Date();
  const thisWeek = startOfWeek(now, 1, ZONE);
  /** Noon (Chicago) `days` days after the start of the week `weeksAgo` weeks back. */
  const at = (weeksAgo: number, days: number) =>
    new Date(addWeeks(thisWeek, -weeksAgo, 1, ZONE).getTime() + days * DAY_MS + 17 * 3_600_000);
  const json = async (path: string, as = token) => {
    const res = await api.get(path, as);
    return { status: res.status, body: await res.json() };
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    admin = await resetTestDb();
    await admin`UPDATE users SET week_start = 1, time_zone = ${ZONE}, units = 'lb',
      sex = 'male', bodyweight = 180 WHERE id = ${USER_A}`;
    await admin`
      INSERT INTO exercises (slug, name, tracking_type, category, equipment, primary_muscles) VALUES
        ('barbell-back-squat', 'Squat', 'weight_reps', 'strength', 'barbell', '{quadriceps}'),
        ('barbell-bench-press', 'Bench Press', 'weight_reps', 'strength', 'barbell', '{chest}')
    `;
    context = { db: getDb(), userId: USER_A, email: "" };
    api = await startV1();
    token = await insertToken(admin, USER_A);
    tokenB = await insertToken(admin, USER_B);

    const push = await createRoutine(context, {
      name: "Push",
      exercises: [{ exercise: "bench press" }],
    });
    const legs = await createRoutine(context, { name: "Legs", exercises: [{ exercise: "squat" }] });
    // Three weeks back, two weeks back, (rest week last week), this week.
    const log = (startedAt: Date, routineId: string, exercise: string, weight: number) =>
      logPastWorkout(context, {
        startedAt: startedAt.toISOString(),
        durationMinutes: 50,
        routineId,
        exercises: [
          {
            exercise,
            sets: [
              { weight: 45, reps: 10, kind: "warmup" },
              { weight, reps: 5 },
              { weight, reps: 5 },
            ],
          },
        ],
      });
    await log(at(3, 0), push.id, "bench press", 135);
    await log(at(3, 2), legs.id, "squat", 185);
    await log(at(2, 0), push.id, "bench press", 140);
    await log(at(2, 2), legs.id, "squat", 195);
    if (at(0, 0) < now) await log(at(0, 0), push.id, "bench press", 145);

    await createProgram(context, {
      name: "PPL",
      mode: "sequence",
      entries: [{ routine: "Push" }, { routine: "Legs" }],
      activate: true,
    });
    await scheduleWorkout(context, {
      routineId: "Legs",
      date: new Date(now.getTime() + 2 * DAY_MS).toISOString().slice(0, 10),
    });
    await logBodyMeasurement(context, {
      kind: "bodyweight",
      value: 80,
      unit: "kg",
      measuredAt: new Date(now.getTime() - 10 * DAY_MS).toISOString(),
    });
    await logBodyMeasurement(context, {
      kind: "bodyweight",
      value: 178,
      unit: "lb",
      measuredAt: new Date(now.getTime() - 2 * DAY_MS).toISOString(),
    });
  });

  afterAll(async () => {
    await api.close();
    await admin.end();
    await getDb().$client.end();
  });

  describe("/v1/weeks and /v1/streak (#738)", () => {
    it("matches weekly_summary week for week, rest weeks included", async () => {
      const { status, body } = await json("/v1/weeks?weeks=4&goal=strength");
      expect(status).toBe(200);
      const weeks = v1WeeksSchema.parse(body);
      const tool = await weeklySummary(context, { weeks: 4, goal: "strength" });
      expect(weeks.weeks).toHaveLength(4);
      weeks.weeks.forEach((week, i) => {
        expect(week.workouts).toBe(tool[i]?.workouts);
        expect(week.workingSets).toBe(tool[i]?.workingSets);
        expect(week.volume).toBe(tool[i]?.totalVolume);
        expect(week.weekStart).toBe(dayIn(new Date(tool[i]?.weekStart ?? ""), ZONE));
      });
      // Last week was a rest week: there, with zeros.
      expect(weeks.weeks[1]).toMatchObject({ workouts: 0, workingSets: 0, volume: 0 });
      // Two weeks back: two workouts, warm-ups left out, 50 minutes each.
      expect(weeks.weeks[2]).toMatchObject({
        workouts: 2,
        workingSets: 4,
        volume: 140 * 10 + 195 * 10,
        durationMinutes: 100,
      });
      expect(weeks.weeks[2]?.topExercises[0]?.name).toBe("Squat");
      expect(weeks.weeks[2]?.muscles.find((m) => m.muscle === "quadriceps")).toMatchObject({
        sets: 2,
        target: { low: 5, high: 10 },
        status: "under",
      });
    });

    it("rejects out-of-range params with bad_request", async () => {
      const { status, body } = await json("/v1/weeks?weeks=40");
      expect(status).toBe(400);
      expect(v1ErrorSchema.parse(body).error.code).toBe("bad_request");
    });

    it("equals trainingStreak for the same history", async () => {
      const streak = v1StreakSchema.parse((await json("/v1/streak")).body);
      const workouts = await listWorkouts(context, { limit: 100 });
      const expected = trainingStreak(
        workouts.map((w) => new Date(w.startedAt)),
        2,
        1,
        new Date(),
        ZONE,
      );
      expect(streak).toEqual({
        weeks: expected.current,
        target: 2,
        thisWeek: { done: expected.thisWeek, target: 2 },
        longest: expected.longest,
      });
      expect(streak.longest).toBe(2);
    });
  });

  describe("/v1/workouts (#739)", () => {
    it("lists finished workouts newest first with the same counts as list_workouts", async () => {
      const list = v1WorkoutsSchema.parse((await json("/v1/workouts?limit=50")).body);
      const tool = await listWorkouts(context, { limit: 50 });
      expect(list.workouts.map((w) => w.id)).toEqual(tool.map((w) => w.id));
      for (const [i, workout] of list.workouts.entries()) {
        expect(workout.workingSets).toBe(tool[i]?.setCount);
        expect(workout.prCount).toBe(tool[i]?.prCount);
        expect(workout.exerciseCount).toBe(1);
        expect(workout.durationMinutes).toBe(50);
        expect(workout.webPath).toBe(`/portal/workouts/${workout.id}`);
      }
      expect(list.workouts.at(-1)?.routineName).toBe("Push");
      expect(list.hasMore).toBe(false);
      const one = v1WorkoutsSchema.parse((await json("/v1/workouts?limit=1")).body);
      expect(one.workouts).toHaveLength(1);
      expect(one.hasMore).toBe(true);
    });

    it("shows only current sets after an edit and a delete", async () => {
      const oldest = (await listWorkouts(context, { limit: 50 })).at(-1);
      const rows = await admin`
        SELECT s.* FROM sets s JOIN session_exercises se ON se.id = s.session_exercise_id
        WHERE se.session_id = ${oldest?.id ?? ""} AND s.kind = 'working' ORDER BY s.set_index`;
      const [first, second] = rows;
      // Edit the first working set's weight; delete the second.
      await admin`INSERT INTO sets (id, user_id, session_exercise_id, set_index, kind, weight, reps,
          completed_at, supersedes_id)
        VALUES (${uuidv7()}, ${USER_A}, ${first?.session_exercise_id}, ${first?.set_index}, 'working',
          130, 5, ${first?.completed_at}, ${first?.id})`;
      await admin`INSERT INTO sets (id, user_id, session_exercise_id, set_index, kind, weight, reps,
          completed_at, supersedes_id, deleted_at)
        VALUES (${uuidv7()}, ${USER_A}, ${second?.session_exercise_id}, ${second?.set_index}, 'working',
          135, 5, ${second?.completed_at}, ${second?.id}, now())`;

      const { status, body } = await json(`/v1/workouts/${oldest?.id}`);
      expect(status).toBe(200);
      const workout = v1WorkoutSchema.parse(body);
      const sets = workout.exercises[0]?.sets ?? [];
      expect(sets.map((s) => [s.kind, s.weight])).toEqual([
        ["warmup", 45],
        ["working", 130],
      ]);
      expect(workout.workingSets).toBe(1);
      // Only the PR kinds the app shows.
      for (const set of sets) expect(set.prs.every((kind) => kind === "1rm")).toBe(true);
    });

    it("404s an unknown id, a malformed one, and another user's workout", async () => {
      const id = (await listWorkouts(context, { limit: 1 }))[0]?.id;
      for (const [path, as] of [
        [`/v1/workouts/${uuidv7()}`, token],
        ["/v1/workouts/nope", token],
        [`/v1/workouts/${id}`, tokenB],
      ] as const) {
        const { status, body } = await json(path, as);
        expect(status, path).toBe(404);
        expect(v1ErrorSchema.parse(body).error.code).toBe("not_found");
      }
    });
  });

  describe("/v1/prs and /v1/lifts (#740)", () => {
    it("lists recent visible PRs with the previous best, matching get_prs", async () => {
      const since = new Date(at(3, 0).getTime() - DAY_MS).toISOString();
      const prs = v1PrsSchema.parse(
        (await json(`/v1/prs?since=${encodeURIComponent(since)}&limit=50`)).body,
      );
      expect(prs.prs.every((pr) => pr.kind === "1rm")).toBe(true);
      expect(prs.hasMore).toBe(false);
      const bench = prs.prs.filter((pr) => pr.exerciseName === "Bench Press");
      // Newest first, each pointing back at the one before.
      expect(bench[0]?.previousValue).toBe(bench[1]?.value);
      expect(bench.at(-1)?.previousValue).toBeNull();
      expect(bench[0]?.unit).toBe("lb");
      expect(bench[0]?.workoutId).toBeTruthy();
      // The newest is the current PR get_prs reports.
      const current = await getPrs(context, { exercise: "bench press", kind: "1rm" });
      expect(bench[0]?.value).toBe(current[0]?.value);
    });

    it("gives daily e1RM points that match exercise_history, and the most-trained default", async () => {
      const lifts = v1LiftsSchema.parse((await json("/v1/lifts")).body);
      expect(lifts.selection).toBe("most_trained");
      const bench = lifts.lifts.find((lift) => lift.name === "Bench Press");
      const history = await exerciseHistory(context, { exercise: "bench press" });
      expect(bench?.points.map((p) => p.e1rm)).toEqual(
        history.estimatedOneRepMaxSeries.map((p) => Math.round(p.estimatedOneRepMax * 100) / 100),
      );
      expect(bench?.best).toBe(Math.max(...(bench?.points.map((p) => p.e1rm) ?? [])));

      const squatId = lifts.lifts.find((lift) => lift.name === "Squat")?.exerciseId;
      const explicit = v1LiftsSchema.parse((await json(`/v1/lifts?exercises=${squatId}`)).body);
      expect(explicit.selection).toBe("explicit");
      expect(explicit.lifts.map((l) => l.name)).toEqual(["Squat"]);

      const tooLong = await json("/v1/lifts?from=2020-01-01T00:00:00Z&to=2026-01-01T00:00:00Z");
      expect(tooLong.status).toBe(400);
      expect((await json(`/v1/lifts?exercises=${uuidv7()}`)).status).toBe(404);
    });
  });

  describe("/v1/body-measurements (#741)", () => {
    it("converts to the user's units, and an empty kind reads null, not 404", async () => {
      const { status, body } = await json("/v1/body-measurements?kinds=bodyweight,waist");
      expect(status).toBe(200);
      const [bodyweight, waist] = v1BodyMeasurementsSchema.parse(body).measurements;
      expect(bodyweight?.unit).toBe("lb");
      expect(bodyweight?.points.map((p) => p.value)).toEqual([176.37, 178]);
      expect(bodyweight?.latest?.value).toBe(178);
      expect(waist).toEqual({ kind: "waist", unit: "in", latest: null, change: null, points: [] });

      await admin`UPDATE users SET units = 'kg' WHERE id = ${USER_A}`;
      const kg = v1BodyMeasurementsSchema.parse((await json("/v1/body-measurements")).body);
      await admin`UPDATE users SET units = 'lb' WHERE id = ${USER_A}`;
      expect(kg.measurements[0]?.unit).toBe("kg");
      expect(kg.measurements[0]?.points.map((p) => p.value)).toEqual([80, 80.74]);

      expect((await json("/v1/body-measurements?kinds=shoe_size")).status).toBe(400);
    });
  });

  describe("/v1/plan and /v1/dpr (#742)", () => {
    it("lists scheduled workouts and the sequence's next routine", async () => {
      const plan = v1PlanSchema.parse((await json("/v1/plan")).body);
      expect(plan.scheduled).toHaveLength(1);
      expect(plan.scheduled[0]).toMatchObject({ routineName: "Legs", exerciseCount: 1 });
      // The latest workout was Push (this week) or Legs (two weeks back).
      const last = (await listWorkouts(context, { limit: 1 }))[0];
      expect(plan.next?.routineName).toBe(last?.routineName === "Push" ? "Legs" : "Push");
      expect(plan.next).toMatchObject({ programName: "PPL", reason: "sequence" });
      expect(plan.next?.webPath).toBe(`/routines/${plan.next?.routineId}`);
      // Legs is in the active program.
      expect(plan.scheduled[0]?.programName).toBe("PPL");
    });

    it("picks a weekly program's routine by the user's weekday, not the server's", async () => {
      // A Monday 03:00 UTC a few weeks out: still Sunday evening in Chicago.
      const monday = new Date(now.getTime() + 21 * DAY_MS);
      monday.setUTCDate(monday.getUTCDate() + ((8 - monday.getUTCDay()) % 7));
      monday.setUTCHours(3, 0, 0, 0);
      await createProgram(context, {
        name: "Weekly",
        mode: "weekly",
        entries: [
          { routine: "Push", weekday: 0 },
          { routine: "Legs", weekday: 1 },
        ],
        activate: true,
      });
      const plan = await v1Plan(context, { days: 7 }, monday);
      expect(plan.next).toMatchObject({
        routineName: "Push",
        programName: "Weekly",
        date: dayIn(monday, ZONE),
      });
      expect(dayIn(monday, ZONE)).not.toBe(monday.toISOString().slice(0, 10));
    });

    it("reports PRP as off with no block, and writes nothing anywhere", async () => {
      const before = await admin`SELECT max(server_seq) AS seq FROM sets`;
      const dpr = v1DprSchema.parse((await json("/v1/dpr")).body);
      expect(dpr).toMatchObject({ enabled: false, block: null, lifts: [] });
      for (const path of ["/v1/plan", "/v1/weeks", "/v1/streak", "/v1/lifts", "/v1/prs"]) {
        await json(path);
      }
      const after = await admin`SELECT max(server_seq) AS seq FROM sets`;
      expect(after[0]?.seq).toBe(before[0]?.seq);
    });
  });
});
