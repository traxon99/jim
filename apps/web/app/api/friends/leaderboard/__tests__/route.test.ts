import { resetTestDb } from "@/lib/test/test-db";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const USER_A = "11111111-1111-1111-1111-111111111111"; // lb
const USER_B = "22222222-2222-2222-2222-222222222222"; // kg
const USER_C = "33333333-3333-3333-3333-333333333333"; // stranger

const claims: { sub: string; email: string } = { sub: USER_A, email: "alice@example.com" };
let signedOut = false;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: signedOut ? null : { claims } }) },
  }),
}));

const board = await import("../route");
const lifts = await import("../../leaderboards/route");

const get = (path: string) => new Request(`http://localhost${path}`);

describe.skipIf(!process.env.TEST_DATABASE_URL)("/api/friends/leaderboard", () => {
  let admin: postgres.Sql;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    admin = await resetTestDb();
    for (const [id, email] of [
      [USER_A, "alice@example.com"],
      [USER_B, "bob@example.com"],
      [USER_C, "carol@example.com"],
    ] as const) {
      await admin`INSERT INTO auth.users (id, email) VALUES (${id}, ${email})`;
      await admin`INSERT INTO public.users (id, email) VALUES (${id}, ${email})`;
    }
    await admin`UPDATE users SET units = 'kg' WHERE id = ${USER_B}`;
    await admin`INSERT INTO friendships (requester_id, addressee_id, status, accepted_at)
      VALUES (${USER_A}, ${USER_B}, 'accepted', now())`;

    const bench = await admin<{ id: string }[]>`
      INSERT INTO exercises (slug, name, tracking_type, primary_muscles)
      VALUES ('bench-press', 'Bench Press', 'weight_reps', '{chest}') RETURNING id`;
    const exerciseId = bench[0]?.id as string;
    for (const [user, weight, e1rm] of [
      [USER_A, 200, 233.33],
      [USER_B, 100, 116.67], // kg
      [USER_C, 300, 350],
    ] as const) {
      const [session] = await admin<{ id: string }[]>`
        INSERT INTO sessions (user_id, device_id, started_at, ended_at)
        VALUES (${user}, 'x', now(), now()) RETURNING id`;
      const [se] = await admin<{ id: string }[]>`
        INSERT INTO session_exercises (user_id, session_id, exercise_id, position)
        VALUES (${user}, ${session?.id}, ${exerciseId}, 0) RETURNING id`;
      const [set] = await admin<{ id: string }[]>`
        INSERT INTO sets (user_id, session_exercise_id, set_index, weight, reps)
        VALUES (${user}, ${se?.id}, 0, ${weight}, 5) RETURNING id`;
      await admin`INSERT INTO personal_records (user_id, exercise_id, kind, value, set_id, achieved_at)
        VALUES (${user}, ${exerciseId}, '1rm', ${e1rm}, ${set?.id}, now()),
               (${user}, ${exerciseId}, 'weight', ${weight}, ${set?.id}, now())`;
    }
  }, 30_000);

  afterAll(async () => {
    await admin.end();
  });

  it("answers 401 when signed out", async () => {
    signedOut = true;
    try {
      expect((await board.GET(get("/api/friends/leaderboard?slug=bench-press"))).status).toBe(401);
      expect((await lifts.GET()).status).toBe(401);
    } finally {
      signedOut = false;
    }
  });

  it("needs an exercise and a well-formed machine", async () => {
    expect((await board.GET(get("/api/friends/leaderboard"))).status).toBe(400);
    expect(
      (await board.GET(get("/api/friends/leaderboard?slug=bench-press&machine=nope"))).status,
    ).toBe(400);
  });

  it("returns you and accepted friends with weights in your units", async () => {
    const response = await board.GET(get("/api/friends/leaderboard?slug=bench-press"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.units).toBe("lb");
    const byName = Object.fromEntries(
      body.rows.map((row: { username: string }) => [row.username, row]),
    );
    expect(Object.keys(byName).sort()).toEqual(["alice", "bob"]);
    // Bob logs in kg: 116.67 kg is 257.21 lb, 100 kg is 220.46 lb.
    expect(byName.bob).toMatchObject({
      units: "lb",
      bestE1rm: 257.21,
      bestWeight: 220.46,
      isMe: false,
    });
    expect(byName.alice).toMatchObject({ bestE1rm: 233.33, bestWeight: 200, isMe: true });
  });

  it("lists the shared lifts", async () => {
    const body = await (await lifts.GET()).json();
    expect(body.lifts).toEqual([
      { slug: "bench-press", name: "Bench Press", machine: null, participants: 2 },
    ]);
  });
});
