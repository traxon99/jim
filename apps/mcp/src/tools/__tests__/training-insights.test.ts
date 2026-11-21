import { estimateOneRepMax } from "@jim/core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserContext } from "../../context.js";
import { createMcpServer } from "../../server.js";
import { USER_A, USER_B, resetTestDb, testContext } from "../../test/test-db.js";
import { deleteWorkout } from "../delete-workout.js";
import { createGym } from "../gyms.js";
import { logPastWorkout } from "../log-past-workout.js";

// The training-insight report tools (issue #860), driven through the MCP
// client the way an agent calls them, against real rows.
describe.skipIf(!process.env.TEST_DATABASE_URL)("training-insight tools (#860)", () => {
  let admin: postgres.Sql;
  let context: UserContext;
  let other: UserContext;
  let client: Client;
  let otherClient: Client;
  const closers: Array<() => Promise<void>> = [];

  async function connect(ctx: UserContext): Promise<Client> {
    const server = createMcpServer(ctx);
    const mcp = new Client({ name: "test", version: "0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), mcp.connect(clientTransport)]);
    closers.push(async () => {
      await mcp.close();
      await server.close();
    });
    return mcp;
  }

  // biome-ignore lint/suspicious/noExplicitAny: tool results are untyped JSON
  async function call(mcp: Client, name: string, args: Record<string, unknown>): Promise<any> {
    const result = await mcp.callTool({ name, arguments: args });
    const [first] = result.content as { type: string; text: string }[];
    if (result.isError) throw new Error(first?.text ?? "tool error");
    return JSON.parse(first?.text ?? "null");
  }

  const november = { from: "2026-11-01", to: "2026-11-20" };
  // 17:00 in Los Angeles (PST, UTC−8) on a November day.
  const evening = (day: string) => `${day}T17:00:00-08:00`;

  beforeAll(async () => {
    admin = await resetTestDb();
    context = testContext(USER_A);
    other = testContext(USER_B);
    await admin`UPDATE users SET time_zone = 'America/Los_Angeles' WHERE id = ${USER_A}`;
    await admin`
      INSERT INTO exercises (slug, name, tracking_type, primary_muscles) VALUES
        ('calf-raise', 'Calf Raise', 'weight_reps', '{calves}'),
        ('romanian-deadlift', 'Romanian Deadlift', 'weight_reps', '{hamstrings}'),
        ('pull-up', 'Pull-up', 'bodyweight', '{lats}'),
        ('bench-press', 'Bench Press', 'weight_reps', '{chest}'),
        ('back-squat', 'Back Squat', 'weight_reps', '{quadriceps}'),
        ('mystery-press', 'Mystery Press', 'weight_reps', '{}')
    `;
    await createGym(context, { name: "Home" });
    await createGym(context, { name: "Travel Gym" });

    // Same calf and RDL targets each week with RPE falling; pull-ups unloaded.
    await logPastWorkout(context, {
      startedAt: evening("2026-11-02"),
      gym: "Home",
      exercises: [
        {
          exercise: "calf raise",
          sets: [
            { weight: 100, reps: 12, rpe: 9 },
            { weight: 100, reps: 12, rpe: 9 },
          ],
        },
        { exercise: "romanian deadlift", sets: [{ weight: 135, reps: 8, rpe: 9 }] },
        { exercise: "pull-up", sets: [{ reps: 8, rpe: 8 }] },
      ],
    });
    await logPastWorkout(context, {
      startedAt: evening("2026-11-09"),
      gym: "Home",
      exercises: [
        {
          exercise: "calf raise",
          sets: [
            { weight: 100, reps: 12, rpe: 8 },
            { weight: 100, reps: 12, rpe: 7 },
          ],
        },
        { exercise: "romanian deadlift", sets: [{ weight: 135, reps: 8, rpe: 8 }] },
        { exercise: "pull-up", sets: [{ reps: 8 }] },
      ],
    });
    await logPastWorkout(context, {
      startedAt: evening("2026-11-16"),
      gym: "Travel Gym",
      exercises: [
        { exercise: "calf raise", sets: [{ weight: 100, reps: 12, rpe: 7 }] },
        { exercise: "romanian deadlift", sets: [{ weight: 135, reps: 8, rpe: 6.5 }] },
        { exercise: "mystery press", sets: [{ weight: 50, reps: 10 }] },
      ],
    });
    // 11 pm and 1 am local: two local days, though both are Nov 19 in UTC.
    const late = await logPastWorkout(context, {
      startedAt: "2026-11-18T23:00:00-08:00",
      durationMinutes: 1,
      exercises: [{ exercise: "bench press", sets: [{ weight: 100, reps: 5 }] }],
    });
    // Three sets logged seconds apart.
    await logPastWorkout(context, {
      startedAt: "2026-11-19T01:00:00-08:00",
      durationMinutes: 0.1,
      exercises: [
        {
          exercise: "bench press",
          sets: [
            { weight: 100, reps: 5 },
            { weight: 100, reps: 5 },
            { weight: 100, reps: 5 },
          ],
        },
      ],
    });
    const deleted = await logPastWorkout(context, {
      startedAt: evening("2026-11-12"),
      exercises: [{ exercise: "bench press", sets: [{ weight: 300, reps: 5 }] }],
    });
    await deleteWorkout(context, { sessionId: deleted.id, dryRun: false });
    // Trained in September only: its predicted 1RM is stale by November.
    await logPastWorkout(context, {
      startedAt: evening("2026-09-20"),
      exercises: [{ exercise: "back squat", sets: [{ weight: 225, reps: 5, rpe: 8 }] }],
    });

    // The 11 pm bench set was edited from 100 to 105: only the new version counts.
    const [lateSet] = await admin`
      SELECT s.* FROM sets s JOIN session_exercises se ON se.id = s.session_exercise_id
      WHERE se.session_id = ${late.id}`;
    await admin`
      INSERT INTO sets (user_id, session_exercise_id, set_index, kind, weight, reps, completed_at, supersedes_id)
      VALUES (${USER_A}, ${lateSet?.session_exercise_id}, 0, 'working', 105, 5, ${lateSet?.completed_at}, ${lateSet?.id})`;

    await admin`INSERT INTO sick_days (user_id, day) VALUES (${USER_A}, '2026-11-05'), (${USER_A}, '2026-11-06')`;
    const [injury] = await admin`
      INSERT INTO injuries (user_id, area, side, started_on) VALUES (${USER_A}, 'shoulder', 'left', '2026-11-10')
      RETURNING id`;
    await admin`INSERT INTO pain_checkins (user_id, injury_id, day, pain_level) VALUES (${USER_A}, ${injury?.id}, '2026-11-12', 3)`;

    await logPastWorkout(other, {
      startedAt: evening("2026-11-03"),
      exercises: [{ exercise: "calf raise", sets: [{ weight: 400, reps: 12, rpe: 6 }] }],
    });

    client = await connect(context);
    otherClient = await connect(other);
  });

  afterAll(async () => {
    for (const close of closers) await close();
    await admin.end();
    await context.db.$client.end();
    await other.db.$client.end();
  });

  it("get_sets returns local days, leaves out deleted and superseded sets, and keeps missing RPE null", async () => {
    const result = await call(client, "get_sets", { ...november, exercise: "bench press" });
    expect(result.range).toMatchObject({ ...november, timeZone: "America/Los_Angeles" });
    expect(
      result.sets.map((set: { localDate: string; weight: number }) => [set.localDate, set.weight]),
    ).toEqual([
      ["2026-11-18", 105],
      ["2026-11-19", 100],
      ["2026-11-19", 100],
      ["2026-11-19", 100],
    ]);
    expect(result.sets[0]).toMatchObject({
      localTime: "23:01",
      rpe: null,
      restBeforeSeconds: null,
    });
    expect(result.sets[2].restBeforeSeconds).toBe(2);

    const pullUps = await call(client, "get_sets", { ...november, exercise: "pull-up" });
    expect(pullUps.sets.map((set: { rpe: number | null }) => set.rpe)).toEqual([8, null]);
  });

  it("get_sets filters by gym and routine and pages with a cursor", async () => {
    const travel = await call(client, "get_sets", { ...november, gym: "Travel Gym" });
    expect(travel.total).toBe(3);
    expect(travel.sets.every((set: { gym: string }) => set.gym === "Travel Gym")).toBe(true);

    const seen: string[] = [];
    let cursor: string | undefined;
    let total = 0;
    do {
      const page = await call(client, "get_sets", {
        ...november,
        limit: 4,
        ...(cursor ? { cursor } : {}),
      });
      total = page.total;
      seen.push(...page.sets.map((set: { setId: string }) => set.setId));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(total).toBe(15);
    expect(new Set(seen).size).toBe(15);

    await expect(call(client, "get_sets", { ...november, routine: "Nope Day" })).rejects.toThrow(
      /No routine matches/,
    );
  });

  it("repeated_target_trends ranks falling RPE first, with sick-day gaps and both e1RMs", async () => {
    const result = await call(client, "repeated_target_trends", november);
    expect(result.formulas.plain.repCap).toBe(15);
    expect(result.formulas.rpeAdjusted.repCap).toBe(20);
    const [top] = result.targets;
    expect(top).toMatchObject({
      exercise: "Romanian Deadlift",
      weight: 135,
      reps: 8,
      firstRpe: 9,
      lastRpe: 6.5,
      rpeChange: -2.5,
      sessionCount: 3,
    });
    const calf = result.targets.find((t: { exercise: string }) => t.exercise === "Calf Raise");
    expect(calf).toMatchObject({ firstRpe: 9, lastRpe: 7, rpeChange: -2 });
    expect(calf.sessions[1]).toMatchObject({
      averageRpe: 7.5,
      rpeSetCount: 2,
      daysSincePrevious: 7,
      sickDaysSincePrevious: 2,
    });
    // Constant weight and reps: flat plain e1RM, rising adjusted e1RM.
    const plain = calf.sessions.map((s: { bestPlainE1rm: number }) => s.bestPlainE1rm);
    expect(new Set(plain)).toEqual(new Set([estimateOneRepMax(100, 12)]));
    const adjusted = calf.sessions.map(
      (s: { bestRpeAdjustedE1rm: number }) => s.bestRpeAdjustedE1rm,
    );
    expect(adjusted[0]).toBeLessThan(adjusted[2]);

    const pullUp = result.targets.find((t: { exercise: string }) => t.exercise === "Pull-up");
    expect(pullUp).toMatchObject({ weight: 0, reps: 8, sessionCount: 2, rpeChange: null });
    // Bench 105 × 5 and 100 × 5 each come from one session only, so neither repeats.
    expect(result.targets.some((t: { weight: number }) => t.weight === 105)).toBe(false);
    // Another user's calf raises never show up.
    expect(calf.sessions).toHaveLength(3);
  });

  it("progress_decomposition credits effort when weight and reps stay put", async () => {
    const result = await call(client, "progress_decomposition", november);
    const rdl = result.exercises.find(
      (e: { exercise: string }) => e.exercise === "Romanian Deadlift",
    );
    expect(rdl).toMatchObject({ status: "ok", basis: "rpe_adjusted", dominant: "effort" });
    expect(rdl.parts.weight).toBe(0);
    expect(rdl.parts.reps).toBe(0);
    expect(rdl.parts.effort).toBeGreaterThan(0);
    expect(rdl.parts.weight + rdl.parts.reps + rdl.parts.effort).toBeCloseTo(rdl.change, 1);

    const mystery = result.exercises.find(
      (e: { exercise: string }) => e.exercise === "Mystery Press",
    );
    expect(mystery).toMatchObject({ status: "insufficient_data", sessions: 1 });
    const pullUp = result.exercises.find((e: { exercise: string }) => e.exercise === "Pull-up");
    expect(pullUp.status).toBe("insufficient_data");
  });

  it("training_context puts sick days, the injury, the gym change and gaps on one timeline", async () => {
    const result = await call(client, "training_context", november);
    const types = result.timeline.map((event: { date: string; type: string }) => [
      event.date,
      event.type,
    ]);
    expect(types).toEqual(
      expect.arrayContaining([
        ["2026-11-02", "gap"],
        ["2026-11-05", "sick_day"],
        ["2026-11-06", "sick_day"],
        ["2026-11-10", "injury_opened"],
        ["2026-11-16", "gym_change"],
      ]),
    );
    expect(result.gaps[0]).toMatchObject({
      from: "2026-11-02",
      to: "2026-11-09",
      days: 7,
      sickDays: 2,
    });
    expect(result.injuries).toEqual([
      expect.objectContaining({
        area: "shoulder",
        side: "left",
        openedOn: "2026-11-10",
        healedOn: null,
        pain: [{ day: "2026-11-12", painLevel: 3 }],
      }),
    ]);
    // Private: the other user sees none of it.
    const theirs = await call(otherClient, "training_context", november);
    expect(theirs).toMatchObject({ sickDays: [], injuries: [], workoutCount: 1 });
  });

  it("data_quality_flags finds rapid sets, an untagged lift and a stale prediction", async () => {
    const result = await call(client, "data_quality_flags", november);
    const types = result.flags.map((flag: { type: string }) => flag.type);
    expect(types.filter((t: string) => t === "rapid_sets")).toHaveLength(2);
    expect(result.flags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "missing_primary_muscle", exercise: "Mystery Press" }),
        expect.objectContaining({
          type: "stale_predicted_1rm",
          exercise: "Back Squat",
          lastTrained: "2026-09-20",
        }),
      ]),
    );
    const rapid = result.flags.find((flag: { type: string }) => flag.type === "rapid_sets");
    expect(rapid.sessionId).toEqual(expect.any(String));
  });

  it("echoes an empty range, falls back to UTC without a zone, and names an unknown exercise", async () => {
    const empty = await call(client, "get_sets", { from: "2025-01-01", to: "2025-01-31" });
    expect(empty).toMatchObject({
      total: 0,
      sets: [],
      nextCursor: null,
      range: { from: "2025-01-01", to: "2025-01-31" },
    });

    const theirs = await call(otherClient, "get_sets", november);
    expect(theirs.range).toMatchObject({ timeZone: "UTC", timeZoneNote: expect.any(String) });
    expect(theirs.sets.map((set: { weight: number }) => set.weight)).toEqual([400]);

    await expect(
      call(client, "repeated_target_trends", { ...november, exercise: "Zercher Lunge" }),
    ).rejects.toThrow(/No exercise matches/);
    await expect(
      call(client, "get_sets", { from: "2026-11-20", to: "2026-11-01" }),
    ).rejects.toThrow(/on or after/);
  });
});
