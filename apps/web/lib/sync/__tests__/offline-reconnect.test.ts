import { mutate } from "@/lib/db/mutate";
import { JimDatabase, createTestDb } from "@/lib/db/schema";
import { resetTestDb } from "@/lib/test/test-db";
import { uuidv7 } from "@jim/core";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runSyncCycle } from "../engine";

const USER_A = "11111111-1111-1111-1111-111111111111";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: USER_A } } }) },
  }),
}));

const { POST: push } = await import("../../../app/api/sync/push/route");
const { GET: pull } = await import("../../../app/api/sync/pull/route");

/** Routes the engine's fetch() calls to the real route handlers directly — no HTTP server needed. */
const routeHandlerFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input), "http://localhost");
  if (url.pathname === "/api/sync/push") return push(new Request(url, init));
  if (url.pathname === "/api/sync/pull") return pull(new Request(url, init));
  throw new Error(`Unhandled fetch in test: ${url}`);
};

describe.skipIf(!process.env.TEST_DATABASE_URL)("offline logging, then reconnect", () => {
  let admin: postgres.Sql;
  let exerciseId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    admin = await resetTestDb();

    await admin`INSERT INTO auth.users (id, email) VALUES (${USER_A}, 'a@example.com')`;
    await admin`INSERT INTO public.users (id, email) VALUES (${USER_A}, 'a@example.com')`;
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

  it("a workout logged fully offline appears in Postgres after reconnecting", async () => {
    const dbName = `jim-e2e-${crypto.randomUUID()}`;
    const offlineDb = createTestDb(dbName);

    // --- Offline: log a full session, never touching the network. ---
    const sessionId = uuidv7();
    const sessionExerciseId = uuidv7();
    const now = new Date();

    await mutate(
      "sessions",
      {
        id: sessionId,
        userId: USER_A,
        routineId: null,
        name: null,
        startedAt: now,
        endedAt: null,
        notes: null,
        bodyweight: null,
        deviceId: "device-a",
        updatedAt: now,
        deletedAt: null,
        serverSeq: 0,
      },
      offlineDb,
    );
    await mutate(
      "sessionExercises",
      {
        id: sessionExerciseId,
        userId: USER_A,
        sessionId,
        exerciseId,
        position: 0,
        supersetGroup: null,
        notes: null,
        stickyNote: null,
        restSeconds: null,
        warmupSets: null,
        updatedAt: now,
        deviceId: "device-a",
        deletedAt: null,
        serverSeq: 0,
      },
      offlineDb,
    );
    for (let setIndex = 0; setIndex < 3; setIndex++) {
      await mutate(
        "sets",
        {
          id: uuidv7(),
          userId: USER_A,
          sessionExerciseId,
          setIndex,
          kind: "working",
          weight: "225.00",
          reps: 5,
          durationSeconds: null,
          distance: null,
          rpe: null,
          rir: null,
          completedAt: new Date(),
          supersedesId: null,
          deletedAt: null,
          serverSeq: 0,
        },
        offlineDb,
      );
    }

    expect(await offlineDb.outbox.count()).toBe(5); // session + session_exercise + 3 sets
    const postgresRowsBefore = await admin`SELECT id FROM sessions WHERE id = ${sessionId}`;
    expect(postgresRowsBefore).toHaveLength(0); // nothing reached the server yet

    // --- Reconnect: the sync engine drains the outbox. ---
    await runSyncCycle(offlineDb, routeHandlerFetch);

    expect(await offlineDb.outbox.count()).toBe(0);

    const [session] = await admin`SELECT id FROM sessions WHERE id = ${sessionId}`;
    expect(session).toBeDefined();
    const [sessionExercise] = await admin`
      SELECT id FROM session_exercises WHERE id = ${sessionExerciseId}
    `;
    expect(sessionExercise).toBeDefined();
    const sets = await admin`SELECT id FROM sets WHERE session_exercise_id = ${sessionExerciseId}`;
    expect(sets).toHaveLength(3);

    await offlineDb.delete();
  });

  it("force-quitting mid-session and relaunching resumes the session with every set intact", async () => {
    const dbName = `jim-relaunch-${crypto.randomUUID()}`;
    const beforeQuit = createTestDb(dbName);

    const sessionId = uuidv7();
    const now = new Date();
    await mutate(
      "sessions",
      {
        id: sessionId,
        userId: USER_A,
        routineId: null,
        name: "In progress",
        startedAt: now,
        endedAt: null,
        notes: null,
        bodyweight: null,
        deviceId: "device-a",
        updatedAt: now,
        deletedAt: null,
        serverSeq: 0,
      },
      beforeQuit,
    );

    // "Force-quit": drop the in-memory reference without closing cleanly.
    // A fresh JimDatabase opened against the same underlying store is what
    // relaunching the app looks like — Dexie/IndexedDB persistence, not
    // anything the sync engine itself has to implement.
    const afterRelaunch = new JimDatabase(dbName);
    const resumed = await afterRelaunch.sessions.get(sessionId);
    expect(resumed?.name).toBe("In progress");

    await afterRelaunch.delete();
  });
});
