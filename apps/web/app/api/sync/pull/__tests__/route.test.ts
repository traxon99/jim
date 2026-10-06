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

const { GET } = await import("../route");
const { POST } = await import("../../push/route");

function push(mutations: unknown[]) {
  return POST(
    new Request("http://localhost/api/sync/push", {
      method: "POST",
      body: JSON.stringify({ mutations }),
    }),
  );
}

function pull(since = 0) {
  return GET(new Request(`http://localhost/api/sync/pull?since=${since}`));
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("GET /api/sync/pull", () => {
  let admin: postgres.Sql;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    admin = await resetTestDb();

    await admin`INSERT INTO auth.users (id, email) VALUES (${USER_A}, 'a@example.com'), (${USER_B}, 'b@example.com')`;
    await admin`INSERT INTO public.users (id, email) VALUES (${USER_A}, 'a@example.com'), (${USER_B}, 'b@example.com')`;
    await admin`
      INSERT INTO exercises (slug, name, tracking_type, primary_muscles)
      VALUES ('bench-press', 'Bench Press', 'weight_reps', '{chest}')
    `;
  }, 30_000);

  afterAll(async () => {
    await admin.end();
  });

  beforeEach(() => {
    claimsSub = USER_A;
  });

  it("returns the global exercise catalog and a routine pushed by this user", async () => {
    const routineId = uuidv7();
    await push([
      {
        id: uuidv7(),
        table: "routines",
        entity: {
          id: routineId,
          name: "Push Day",
          notes: null,
          position: 0,
          folder: null,
          updatedAt: new Date().toISOString(),
          deviceId: "device-a",
          deletedAt: null,
        },
      },
    ]);

    const body = await (await pull(0)).json();
    expect(body.changes.exercises).toHaveLength(1);
    expect(body.changes.exercises[0].name).toBe("Bench Press");
    expect(body.changes.routines).toHaveLength(1);
    expect(body.changes.routines[0].id).toBe(routineId);
    expect(body.cursor).toBeGreaterThan(0);
  });

  it("returns nothing new for a cursor already at the high-water mark", async () => {
    const first = await (await pull(0)).json();
    const second = await (await pull(first.cursor)).json();
    for (const rows of Object.values(second.changes)) {
      expect(rows).toEqual([]);
    }
    expect(second.cursor).toBe(first.cursor);
  });

  it("picks up a new mutation with a pull since the previous cursor", async () => {
    const { cursor: cursorBefore } = await (await pull(0)).json();

    const routineId = uuidv7();
    await push([
      {
        id: uuidv7(),
        table: "routines",
        entity: {
          id: routineId,
          name: "Leg Day",
          notes: null,
          position: 0,
          folder: null,
          updatedAt: new Date().toISOString(),
          deviceId: "device-a",
          deletedAt: null,
        },
      },
    ]);

    const body = await (await pull(cursorBefore)).json();
    expect(body.changes.routines).toHaveLength(1);
    expect(body.changes.routines[0].id).toBe(routineId);
    expect(body.changes.exercises).toEqual([]); // unchanged since cursorBefore
  });

  it("includes a tombstoned row rather than omitting it", async () => {
    const { cursor: cursorBefore } = await (await pull(0)).json();

    const routineId = uuidv7();
    const now = new Date().toISOString();
    await push([
      {
        id: uuidv7(),
        table: "routines",
        entity: {
          id: routineId,
          name: "To Delete",
          notes: null,
          position: 0,
          folder: null,
          updatedAt: now,
          deviceId: "device-a",
          deletedAt: null,
        },
      },
    ]);
    await push([
      {
        id: uuidv7(),
        table: "routines",
        entity: {
          id: routineId,
          name: "To Delete",
          notes: null,
          position: 0,
          folder: null,
          updatedAt: new Date(Date.now() + 1000).toISOString(),
          deviceId: "device-a",
          deletedAt: new Date().toISOString(),
        },
      },
    ]);

    const body = await (await pull(cursorBefore)).json();
    const routine = body.changes.routines.find((r: { id: string }) => r.id === routineId);
    expect(routine).toBeDefined();
    expect(routine.deletedAt).not.toBeNull();
  });

  it("never returns another user's rows, but does return the shared exercise catalog", async () => {
    claimsSub = USER_B;
    const body = await (await pull(0)).json();
    expect(body.changes.routines).toEqual([]);
    expect(body.changes.exercises).toHaveLength(1);
  });

  it("a custom exercise survives a full push/pull sync round trip", async () => {
    const { cursor: cursorBefore } = await (await pull(0)).json();

    const exerciseId = uuidv7();
    const now = new Date().toISOString();
    const pushResponse = await push([
      {
        id: uuidv7(),
        table: "exercises",
        entity: {
          id: exerciseId,
          slug: "my-custom-curl",
          name: "My Custom Curl",
          aliases: ["custom curl"],
          primaryMuscles: ["biceps"],
          secondaryMuscles: [],
          equipment: "dumbbell",
          mechanic: "isolation",
          force: "pull",
          level: "beginner",
          trackingType: "weight_reps",
          instructions: ["Curl it."],
          imageUrls: [],
          videoUrl: null,
          isArchived: false,
          createdAt: now,
          updatedAt: now,
          deviceId: "device-a",
        },
      },
    ]);
    expect((await pushResponse.json()).results[0].status).toBe("applied");

    const body = await (await pull(cursorBefore)).json();
    const custom = body.changes.exercises.find((e: { id: string }) => e.id === exerciseId);
    expect(custom).toBeDefined();
    expect(custom).toMatchObject({
      name: "My Custom Curl",
      slug: "my-custom-curl",
      primaryMuscles: ["biceps"],
      isArchived: false,
    });

    // Owned by the pushing user, RLS-invisible to anyone else.
    claimsSub = USER_B;
    const otherUsersView = await (await pull(cursorBefore)).json();
    expect(otherUsersView.changes.exercises.some((e: { id: string }) => e.id === exerciseId)).toBe(
      false,
    );
  });

  it("round-trips a program's duration and a PRP block with its lifts", async () => {
    const { cursor: cursorBefore } = await (await pull(0)).json();
    const catalog = (await (await pull(0)).json()).changes.exercises;
    const exerciseId = catalog[0].id as string;

    const programId = uuidv7();
    const blockId = uuidv7();
    const liftId = uuidv7();
    const now = new Date().toISOString();
    const response = await push([
      {
        id: uuidv7(),
        table: "programs",
        entity: {
          id: programId,
          name: "8-week block",
          mode: "sequence",
          isActive: true,
          notes: null,
          position: 0,
          durationWeeks: 8,
          activatedAt: now,
          createdAt: now,
          updatedAt: now,
          deviceId: "device-a",
          deletedAt: null,
        },
      },
      {
        id: uuidv7(),
        table: "dprBlocks",
        entity: {
          id: blockId,
          startedAt: now,
          weeks: 8,
          endsAt: now,
          status: "active",
          aggressiveness: "moderate",
          experience: "intermediate",
          programId,
          createdAt: now,
          updatedAt: now,
          deviceId: "device-a",
          deletedAt: null,
        },
      },
      {
        id: uuidv7(),
        table: "dprBlockLifts",
        entity: {
          id: liftId,
          blockId,
          exerciseId,
          position: 0,
          baselineE1rm: "239.17",
          goalE1rm: "263.09",
          updatedAt: now,
          deviceId: "device-a",
          deletedAt: null,
        },
      },
    ]);
    const results = (await response.json()).results;
    expect(results.map((r: { status: string }) => r.status)).toEqual([
      "applied",
      "applied",
      "applied",
    ]);

    const body = await (await pull(cursorBefore)).json();
    expect(body.changes.programs.find((p: { id: string }) => p.id === programId)).toMatchObject({
      durationWeeks: 8,
      activatedAt: now,
    });
    expect(body.changes.dprBlocks).toEqual([
      expect.objectContaining({ id: blockId, weeks: 8, status: "active", programId }),
    ]);
    expect(body.changes.dprBlockLifts).toEqual([
      expect.objectContaining({ id: liftId, blockId, baselineE1rm: "239.17", goalE1rm: "263.09" }),
    ]);

    claimsSub = USER_B;
    const otherUsersView = await (await pull(cursorBefore)).json();
    expect(otherUsersView.changes.dprBlocks).toEqual([]);
    expect(otherUsersView.changes.dprBlockLifts).toEqual([]);
  });
});
