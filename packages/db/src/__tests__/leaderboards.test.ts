import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, first, resetTestDb } from "./test-db";

const A = "11111111-1111-1111-1111-111111111111"; // the viewer
const B = "22222222-2222-2222-2222-222222222222"; // accepted friend, logs in kg
const C = "33333333-3333-3333-3333-333333333333"; // pending request only
const D = "44444444-4444-4444-4444-444444444444"; // stranger
const E = "55555555-5555-5555-5555-555555555555"; // accepted friend, opts out later

interface BoardRow {
  user_id: string;
  username: string;
  is_me: boolean;
  units: string;
  best_e1rm: string | null;
  best_e1rm_at: Date | null;
  best_weight: string | null;
  best_weight_reps: number | null;
  best_weight_at: Date | null;
  relative_strength: string | null;
}

interface LiftRow {
  slug: string;
  name: string;
  machine: { brand: string; model: string; latitude: number; longitude: number } | null;
  participants: number;
}

const DAY = 86_400_000;
const t = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString();

describe.skipIf(!process.env.TEST_DATABASE_URL)("friend leaderboards", () => {
  let admin: postgres.Sql;
  let seedBench: string;

  beforeAll(async () => {
    admin = await resetTestDb();
    const people: [string, string][] = [
      [A, "alice@example.com"],
      [B, "bob@example.com"],
      [C, "carol@example.com"],
      [D, "dave@example.com"],
      [E, "erin@example.com"],
    ];
    for (const [id, email] of people) {
      await admin`INSERT INTO auth.users (id, email) VALUES (${id}, ${email})`;
      await admin`INSERT INTO public.users (id, email) VALUES (${id}, ${email})`;
    }
    await admin`UPDATE users SET units = 'kg' WHERE id = ${B}`;
    await admin`INSERT INTO friendships (requester_id, addressee_id, status, accepted_at) VALUES
      (${A}, ${B}, 'accepted', now()), (${E}, ${A}, 'accepted', now())`;
    await admin`INSERT INTO friendships (requester_id, addressee_id, status) VALUES (${C}, ${A}, 'pending')`;

    seedBench = first(
      await admin<{ id: string }[]>`
        INSERT INTO exercises (slug, name, tracking_type, primary_muscles)
        VALUES ('bench-press', 'Bench Press', 'weight_reps', '{chest}') RETURNING id`,
    ).id;
  }, 30_000);

  afterAll(async () => {
    await admin.end();
  });

  async function cloneOf(
    userId: string,
    slug: string,
    extra: { brand?: string; model?: string; gym?: string } = {},
  ) {
    return first(
      await admin<{ id: string }[]>`
        INSERT INTO exercises (owner_id, slug, name, tracking_type, primary_muscles, machine_brand, machine_model, gym_id)
        VALUES (${userId}, ${slug}, 'My copy', 'weight_reps', '{chest}',
                ${extra.brand ?? null}, ${extra.model ?? null}, ${extra.gym ?? null})
        RETURNING id`,
    ).id;
  }

  /** Logs one finished set and the PR rows it earned, like the phone does. */
  async function lift(
    userId: string,
    exerciseId: string,
    weight: number,
    reps: number,
    e1rm: number,
    achievedAt: string,
    opts: { deletedSession?: boolean; deletedPr?: boolean } = {},
  ) {
    const session = first(
      await admin<{ id: string }[]>`
        INSERT INTO sessions (user_id, device_id, started_at, ended_at, deleted_at)
        VALUES (${userId}, 'x', ${achievedAt}, ${achievedAt}, ${opts.deletedSession ? achievedAt : null})
        RETURNING id`,
    );
    const se = first(
      await admin<{ id: string }[]>`
        INSERT INTO session_exercises (user_id, session_id, exercise_id, position)
        VALUES (${userId}, ${session.id}, ${exerciseId}, 0) RETURNING id`,
    );
    const set = first(
      await admin<{ id: string }[]>`
        INSERT INTO sets (user_id, session_exercise_id, set_index, weight, reps, completed_at)
        VALUES (${userId}, ${se.id}, 0, ${weight}, ${reps}, ${achievedAt}) RETURNING id`,
    );
    const deletedAt = opts.deletedPr ? achievedAt : null;
    await admin`INSERT INTO personal_records (user_id, exercise_id, kind, value, set_id, achieved_at, deleted_at)
      VALUES (${userId}, ${exerciseId}, '1rm', ${e1rm}, ${set.id}, ${achievedAt}, ${deletedAt}),
             (${userId}, ${exerciseId}, 'weight', ${weight}, ${set.id}, ${achievedAt}, ${deletedAt})`;
  }

  const board = (userId: string, slug: string, machine: object | null = null) =>
    asUser(
      admin,
      userId,
      (tx) =>
        tx<
          BoardRow[]
        >`SELECT * FROM friend_lift_leaderboard(${slug}, ${machine ? JSON.stringify(machine) : null}::jsonb)`,
    );
  const lifts = (userId: string) =>
    asUser(admin, userId, (tx) => tx<LiftRow[]>`SELECT * FROM friend_leaderboard_lifts()`);

  it("lists me and accepted friends only, matching a clone to its seed by slug", async () => {
    const bClone = await cloneOf(B, "bench-press");
    await lift(A, seedBench, 200, 5, 233.33, t(10));
    await lift(B, bClone, 100, 5, 116.67, t(5));
    await lift(E, await cloneOf(E, "bench-press"), 150, 5, 175, t(4));
    await lift(C, await cloneOf(C, "bench-press"), 300, 1, 300, t(3));
    await lift(D, await cloneOf(D, "bench-press"), 400, 1, 400, t(3));

    const rows = await board(A, "bench-press");
    expect(rows.map((r) => r.username).sort()).toEqual(["alice", "bob", "erin"]);
    expect(rows.find((r) => r.is_me)?.user_id).toBe(A);
    expect(rows.find((r) => r.username === "bob")).toMatchObject({
      units: "kg",
      best_e1rm: "116.67",
      best_weight: "100.00",
      best_weight_reps: 5,
    });
  });

  it("returns nothing to a signed-out caller", async () => {
    expect(await board(null as unknown as string, "bench-press")).toHaveLength(0);
  });

  it("uses the max live e1RM and ignores deleted PR rows and deleted workouts", async () => {
    await lift(A, seedBench, 210, 5, 245, t(2), { deletedPr: true });
    await lift(A, seedBench, 220, 5, 256.67, t(1), { deletedSession: true });
    const mine = (await board(A, "bench-press")).find((r) => r.is_me);
    expect(mine).toMatchObject({ best_e1rm: "233.33", best_weight: "200.00" });

    await lift(A, seedBench, 205, 5, 239.17, t(1));
    const after = (await board(A, "bench-press")).find((r) => r.is_me);
    expect(after).toMatchObject({
      best_e1rm: "239.17",
      best_weight: "205.00",
      best_weight_reps: 5,
    });
  });

  it("takes a friend off the board when they opt out of leaderboards or workout sharing", async () => {
    await admin`UPDATE users SET share_leaderboards = false WHERE id = ${E}`;
    expect((await board(A, "bench-press")).map((r) => r.username)).not.toContain("erin");
    // They still see the board, with their own row.
    const asE = await board(E, "bench-press");
    expect(asE.map((r) => r.username).sort()).toEqual(["alice", "erin"]);
    expect(asE.find((r) => r.is_me)?.username).toBe("erin");

    await admin`UPDATE users SET share_leaderboards = true, share_workouts = false WHERE id = ${E}`;
    expect((await board(A, "bench-press")).map((r) => r.username)).not.toContain("erin");
    expect((await board(E, "bench-press")).some((r) => r.is_me)).toBe(true);

    await admin`UPDATE users SET share_workouts = true WHERE id = ${E}`;
    expect((await board(A, "bench-press")).map((r) => r.username)).toContain("erin");
  });

  it("shares relative strength only when opted in, and never the bodyweight", async () => {
    await admin`INSERT INTO body_measurements (user_id, kind, value, unit, measured_at) VALUES
      (${B}, 'bodyweight', 80, 'kg', ${t(30)}),
      (${B}, 'bodyweight', 70, 'kg', ${t(1)}),
      (${A}, 'bodyweight', 200, 'lb', ${t(30)})`;

    let rows = await board(A, "bench-press");
    expect(rows.find((r) => r.username === "bob")?.relative_strength).toBeNull();
    // My own is always visible to me: 239.17 lb / 200 lb.
    expect(rows.find((r) => r.is_me)?.relative_strength).toBe("1.20");

    await admin`UPDATE users SET share_relative_strength = true WHERE id = ${B}`;
    rows = await board(A, "bench-press");
    const bob = rows.find((r) => r.username === "bob");
    // 116.67 kg over the 80 kg weighed before it was set (the 70 kg weigh-in came later).
    expect(bob?.relative_strength).toBe("1.46");
    for (const row of rows) {
      expect(Object.keys(row).some((k) => k.includes("bodyweight"))).toBe(false);
    }
  });

  it("matches a machine exercise only on make, model and a nearby gym", async () => {
    const mkGym = async (userId: string, lat: number | null, lng: number | null) =>
      first(
        await admin<{ id: string }[]>`
          INSERT INTO gyms (user_id, name, latitude, longitude) VALUES (${userId}, 'Gym', ${lat}, ${lng})
          RETURNING id`,
      ).id;
    const aGym = await mkGym(A, 40.0, -75.0);
    const bNear = await mkGym(B, 40.001, -75.0); // ~111 m away
    const eFar = await mkGym(E, 40.01, -75.0); // ~1.1 km away
    const aMachine = await cloneOf(A, "leg-press", {
      brand: "Hammer Strength",
      model: "Plate Loaded",
      gym: aGym,
    });
    const bMachine = await cloneOf(B, "leg-press", {
      brand: "hammer strength",
      model: "PLATE LOADED",
      gym: bNear,
    });
    const eMachine = await cloneOf(E, "leg-press", {
      brand: "Hammer Strength",
      model: "Plate Loaded",
      gym: eFar,
    });
    const dMachine = await cloneOf(B, "leg-press", {
      brand: "Life Fitness",
      model: "Linear",
      gym: bNear,
    });
    // Friend's plain (no machine) copy never lands on a machine board.
    const bPlain = await cloneOf(B, "leg-press");
    await lift(A, aMachine, 300, 10, 400, t(3));
    await lift(B, bMachine, 250, 10, 333.33, t(3));
    await lift(E, eMachine, 500, 10, 666.67, t(3));
    await lift(B, dMachine, 900, 10, 1200, t(3));
    await lift(B, bPlain, 700, 10, 933.33, t(3));

    const key = {
      brand: "Hammer Strength",
      model: "Plate Loaded",
      latitude: 40.0,
      longitude: -75.0,
    };
    expect((await board(A, "leg-press", key)).map((r) => r.username).sort()).toEqual([
      "alice",
      "bob",
    ]);
    expect((await board(A, "leg-press", { ...key, brand: "" })).length).toBe(0);
    expect((await board(A, "leg-press")).map((r) => r.username)).toEqual(["bob"]);

    const list = await lifts(A);
    expect(list.find((l) => l.slug === "leg-press")).toMatchObject({
      machine: { brand: "Hammer Strength", model: "Plate Loaded", latitude: 40, longitude: -75 },
      participants: 2,
    });
  });

  it("lists shared lifts, busiest first, and leaves out machines without make/model or a pinned gym", async () => {
    const unpinned = await admin<{ id: string }[]>`
      INSERT INTO gyms (user_id, name) VALUES (${A}, 'Unpinned') RETURNING id`;
    const noGym = await cloneOf(A, "cable-row", {
      brand: "Rogue",
      model: "Cable",
      gym: first(unpinned).id,
    });
    const noModel = await cloneOf(A, "cable-fly", { brand: "Rogue" });
    await lift(A, noGym, 100, 10, 133.33, t(2));
    await lift(A, noModel, 100, 10, 133.33, t(2));
    await lift(B, await cloneOf(B, "cable-row"), 100, 10, 133.33, t(2));
    await lift(B, await cloneOf(B, "cable-fly"), 100, 10, 133.33, t(2));

    const list = await lifts(A);
    expect(list.map((l) => l.slug)).not.toContain("cable-row");
    expect(list.map((l) => l.slug)).not.toContain("cable-fly");
    // Bench has A, B and E; leg press (machine) has A and B.
    expect(list[0]).toMatchObject({ slug: "bench-press", participants: 3 });
  });

  it("is executable by signed-in users only", async () => {
    const rows = await admin<{ anon: boolean; auth: boolean }[]>`
      SELECT has_function_privilege('anon', 'friend_lift_leaderboard(text, jsonb)', 'EXECUTE') AS anon,
             has_function_privilege('authenticated', 'friend_lift_leaderboard(text, jsonb)', 'EXECUTE') AS auth`;
    expect(first(rows)).toEqual({ anon: false, auth: true });
  });
});
