import { resetTestDb } from "@/lib/test/test-db";
import { uuidv7 } from "@jim/core";
import type postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

let claimsSub: string = USER_A;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: claimsSub } } }) },
  }),
}));

const { POST } = await import("../route");

function push(mutations: unknown[]) {
  return POST(
    new Request("http://localhost/api/sync/push", {
      method: "POST",
      body: JSON.stringify({ mutations }),
    }),
  );
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("POST /api/sync/push", () => {
  let admin: postgres.Sql;
  let exerciseId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    admin = await resetTestDb();

    await admin`INSERT INTO auth.users (id, email) VALUES (${USER_A}, 'a@example.com'), (${USER_B}, 'b@example.com')`;
    await admin`INSERT INTO public.users (id, email) VALUES (${USER_A}, 'a@example.com'), (${USER_B}, 'b@example.com')`;
    const [exercise] = await admin<{ id: string }[]>`
      INSERT INTO exercises (slug, name, tracking_type, primary_muscles)
      VALUES ('bench-press', 'Bench Press', 'weight_reps', '{chest}')
      RETURNING id
    `;
    // biome-ignore lint/style/noNonNullAssertion: just inserted
    exerciseId = exercise!.id;
  }, 30_000);

  afterAll(async () => {
    await admin.end();
  });

  beforeEach(() => {
    claimsSub = USER_A;
  });

  it("applies a routine mutation and reports it as applied", async () => {
    const routineId = uuidv7();
    const now = new Date().toISOString();
    const response = await push([
      {
        id: uuidv7(),
        table: "routines",
        entity: {
          id: routineId,
          name: "Push Day",
          notes: null,
          position: 0,
          folder: null,
          updatedAt: now,
          deviceId: "device-a",
          deletedAt: null,
        },
      },
    ]);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results).toEqual([{ id: body.results[0].id, status: "applied" }]);

    const [row] = await admin<{ name: string; user_id: string }[]>`
      SELECT name, user_id FROM routines WHERE id = ${routineId}
    `;
    expect(row?.name).toBe("Push Day");
    expect(row?.user_id).toBe(USER_A);
  });

  it("is idempotent: replaying the same mutation id is a no-op the second time", async () => {
    const routineId = uuidv7();
    const mutationId = uuidv7();
    const mutation = {
      id: mutationId,
      table: "routines",
      entity: {
        id: routineId,
        name: "Pull Day",
        notes: null,
        position: 0,
        folder: null,
        updatedAt: new Date().toISOString(),
        deviceId: "device-a",
        deletedAt: null,
      },
    };

    const first = await (await push([mutation])).json();
    const second = await (await push([mutation])).json();
    expect(first.results[0].status).toBe("applied");
    expect(second.results[0].status).toBe("duplicate");

    const rows = await admin`SELECT id FROM routines WHERE id = ${routineId}`;
    expect(rows).toHaveLength(1);
  });

  it("converges to the later updatedAt regardless of push order (LWW)", async () => {
    const routineId = uuidv7();
    const earlier = new Date("2026-01-01T00:00:00Z").toISOString();
    const later = new Date("2026-01-02T00:00:00Z").toISOString();

    const olderEdit = {
      id: uuidv7(),
      table: "routines",
      entity: {
        id: routineId,
        name: "From device A (older)",
        notes: null,
        position: 0,
        folder: null,
        updatedAt: earlier,
        deviceId: "device-a",
        deletedAt: null,
      },
    };
    const newerEdit = {
      id: uuidv7(),
      table: "routines",
      entity: {
        id: routineId,
        name: "From device B (newer)",
        notes: null,
        position: 0,
        folder: null,
        updatedAt: later,
        deviceId: "device-b",
        deletedAt: null,
      },
    };

    // Newer edit arrives first, older edit arrives second — order must not matter.
    await push([newerEdit]);
    await push([olderEdit]);

    const [row] = await admin<
      { name: string }[]
    >`SELECT name FROM routines WHERE id = ${routineId}`;
    expect(row?.name).toBe("From device B (newer)");
  });

  it("stores and updates a routine exercise's custom progression rule (issue #255)", async () => {
    const routineId = uuidv7();
    const itemId = uuidv7();
    const routine = {
      id: routineId,
      name: "GZCLP A1",
      notes: null,
      position: 0,
      folder: null,
      iconShape: "square",
      iconColor: "blue",
      kind: "strength",
      warmupRoutineId: null,
      warmupMinutes: null,
      updatedAt: new Date("2026-03-01T00:00:00Z").toISOString(),
      deviceId: "device-a",
      deletedAt: null,
    };
    const item = (rule: unknown, at: string) => ({
      id: uuidv7(),
      table: "routineExercises",
      entity: {
        id: itemId,
        routineId,
        exerciseId,
        position: 0,
        targetSets: 5,
        targetRepsLow: 3,
        targetRepsHigh: 3,
        progressionRule: rule,
        updatedAt: at,
        deviceId: "device-a",
        deletedAt: null,
      },
    });
    const t1 = { type: "linear", increment: 10, stages: [{ sets: 5, reps: 3 }] };
    await push([
      { id: uuidv7(), table: "routines", entity: routine },
      item(t1, "2026-03-01T00:00:00Z"),
    ]);
    const read = async () =>
      (
        await admin<{ progression_rule: unknown }[]>`
          SELECT progression_rule FROM routine_exercises WHERE id = ${itemId}
        `
      )[0]?.progression_rule;
    expect(await read()).toEqual(t1);

    await push([item(null, "2026-03-02T00:00:00Z")]);
    expect(await read()).toBeNull();
  });

  it("applies warm-up routines, the link to them, and hold-time targets (issue #59)", async () => {
    const warmupId = uuidv7();
    const legDayId = uuidv7();
    const itemId = uuidv7();
    const now = new Date("2026-02-01T00:00:00Z").toISOString();
    const routineEntity = {
      notes: null,
      position: 0,
      folder: null,
      iconShape: "square",
      iconColor: "blue",
      updatedAt: now,
      deviceId: "device-a",
      deletedAt: null,
    };

    const response = await push([
      {
        id: uuidv7(),
        table: "routines",
        entity: {
          ...routineEntity,
          id: warmupId,
          name: "Leg warm-up",
          kind: "warmup",
          warmupRoutineId: null,
          warmupMinutes: 10,
        },
      },
      {
        id: uuidv7(),
        table: "routineExercises",
        entity: {
          id: itemId,
          routineId: warmupId,
          exerciseId,
          position: 0,
          targetSets: 2,
          targetDurationSeconds: 30,
          updatedAt: now,
          deviceId: "device-a",
          deletedAt: null,
        },
      },
      {
        id: uuidv7(),
        table: "routines",
        entity: {
          ...routineEntity,
          id: legDayId,
          name: "Leg day",
          kind: "strength",
          warmupRoutineId: warmupId,
          warmupMinutes: null,
        },
      },
    ]);
    const body = await response.json();
    expect(body.results.map((r: { status: string }) => r.status)).toEqual([
      "applied",
      "applied",
      "applied",
    ]);

    const rows = await admin<
      {
        id: string;
        kind: string;
        warmup_routine_id: string | null;
        warmup_minutes: number | null;
      }[]
    >`SELECT id, kind, warmup_routine_id, warmup_minutes FROM routines WHERE id IN (${warmupId}, ${legDayId})`;
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(warmupId)).toMatchObject({ kind: "warmup", warmup_minutes: 10 });
    expect(byId.get(legDayId)).toMatchObject({ kind: "strength", warmup_routine_id: warmupId });

    const [item] = await admin<{ target_duration_seconds: number }[]>`
      SELECT target_duration_seconds FROM routine_exercises WHERE id = ${itemId}
    `;
    expect(item?.target_duration_seconds).toBe(30);

    // Unlinking the warm-up is an ordinary LWW edit.
    await push([
      {
        id: uuidv7(),
        table: "routines",
        entity: {
          ...routineEntity,
          id: legDayId,
          name: "Leg day",
          kind: "strength",
          warmupRoutineId: null,
          warmupMinutes: null,
          updatedAt: new Date("2026-02-02T00:00:00Z").toISOString(),
        },
      },
    ]);
    const [unlinked] = await admin<{ warmup_routine_id: string | null }[]>`
      SELECT warmup_routine_id FROM routines WHERE id = ${legDayId}
    `;
    expect(unlinked?.warmup_routine_id).toBeNull();
  });

  it("logs a full workout (session + session_exercise + set) in one batch", async () => {
    const sessionId = uuidv7();
    const sessionExerciseId = uuidv7();
    const setId = uuidv7();
    const now = new Date().toISOString();

    const response = await push([
      {
        id: uuidv7(),
        table: "sessions",
        entity: {
          id: sessionId,
          routineId: null,
          name: null,
          endedAt: null,
          notes: null,
          bodyweight: null,
          intensity: null,
          deviceId: "device-a",
          updatedAt: now,
          deletedAt: null,
        },
      },
      {
        id: uuidv7(),
        table: "sessionExercises",
        entity: {
          id: sessionExerciseId,
          sessionId,
          exerciseId,
          position: 0,
          supersetGroup: null,
          notes: null,
          updatedAt: now,
          deviceId: "device-a",
          deletedAt: null,
        },
      },
      {
        id: uuidv7(),
        table: "sets",
        entity: {
          id: setId,
          sessionExerciseId,
          setIndex: 0,
          kind: "working",
          weight: "225.00",
          reps: 5,
          durationSeconds: null,
          distance: null,
          rpe: null,
          rir: null,
          restSeconds: null,
          restTargetSeconds: null,
          completedAt: now,
          supersedesId: null,
          deletedAt: null,
        },
      },
    ]);

    const body = await response.json();
    expect(body.results.map((r: { status: string }) => r.status)).toEqual([
      "applied",
      "applied",
      "applied",
    ]);

    const [set] = await admin<{ weight: string; reps: number }[]>`
      SELECT weight, reps FROM sets WHERE id = ${setId}
    `;
    expect(set).toMatchObject({ weight: "225.00", reps: 5 });
  });

  it("stamps every pushed row with the verified session's user id, never a client-supplied one", async () => {
    claimsSub = USER_A;
    const routineId = uuidv7();
    await push([
      {
        id: uuidv7(),
        table: "routines",
        // A malicious or buggy client claiming to be someone else — the
        // route must ignore any userId the payload might carry and use
        // only the id verified by getClaims().
        entity: {
          id: routineId,
          userId: USER_B,
          name: "User A's routine",
          notes: null,
          position: 0,
          folder: null,
          updatedAt: new Date().toISOString(),
          deviceId: "device-a",
          deletedAt: null,
        },
      },
    ]);

    const [row] = await admin<{ user_id: string }[]>`
      SELECT user_id FROM routines WHERE id = ${routineId}
    `;
    expect(row?.user_id).toBe(USER_A);
  });
});
