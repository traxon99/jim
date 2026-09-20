import type postgres from "postgres";
import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, first, resetTestDb } from "./test-db";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

describe.skipIf(!process.env.TEST_DATABASE_URL)("RLS and sets immutability", () => {
  let admin: postgres.Sql;
  let exerciseId: string;

  beforeAll(async () => {
    admin = await resetTestDb();

    await admin`INSERT INTO auth.users (id, email) VALUES (${USER_A}, 'a@example.com'), (${USER_B}, 'b@example.com')`;
    await admin`INSERT INTO public.users (id, email) VALUES (${USER_A}, 'a@example.com'), (${USER_B}, 'b@example.com')`;

    const exercise = first(
      await admin<{ id: string }[]>`
      INSERT INTO exercises (slug, name, tracking_type, primary_muscles)
      VALUES ('bench-press', 'Bench Press', 'weight_reps', '{chest}')
      RETURNING id
    `,
    );
    exerciseId = exercise.id;
  }, 30_000);

  afterAll(async () => {
    await admin.end();
  });

  it("lets a user read their own session but not another user's", async () => {
    await admin`INSERT INTO sessions (user_id, device_id) VALUES (${USER_A}, 'device-a')`;

    const ownRows = await asUser(admin, USER_A, (tx) => tx`SELECT * FROM sessions`);
    expect(ownRows).toHaveLength(1);

    const otherRows = await asUser(admin, USER_B, (tx) => tx`SELECT * FROM sessions`);
    expect(otherRows).toHaveLength(0);
  });

  it("applies the same isolation to routines and personal_records", async () => {
    await admin`INSERT INTO routines (user_id, name) VALUES (${USER_A}, 'Push Day')`;
    await admin`INSERT INTO personal_records (user_id, exercise_id, kind, value, achieved_at)
      VALUES (${USER_A}, ${exerciseId}, '1rm', 225, now())`;

    for (const table of ["routines", "personal_records"] as const) {
      const own = await asUser(admin, USER_A, (tx) => tx.unsafe(`SELECT * FROM ${table}`));
      expect(own.length).toBeGreaterThan(0);
      const other = await asUser(admin, USER_B, (tx) => tx.unsafe(`SELECT * FROM ${table}`));
      expect(other).toHaveLength(0);
    }
  });

  it("lets every authenticated user see global exercises, never another user's clone", async () => {
    await admin`INSERT INTO exercises (owner_id, slug, name, tracking_type, primary_muscles)
      VALUES (${USER_A}, 'bench-press-a-variant', 'A''s Bench Variant', 'weight_reps', '{chest}')`;

    const asA = await asUser(admin, USER_A, (tx) => tx`SELECT slug FROM exercises`);
    const slugsA = asA.map((r) => r.slug);
    expect(slugsA).toContain("bench-press"); // global
    expect(slugsA).toContain("bench-press-a-variant"); // own clone

    const asB = await asUser(admin, USER_B, (tx) => tx`SELECT slug FROM exercises`);
    const slugsB = asB.map((r) => r.slug);
    expect(slugsB).toContain("bench-press"); // global
    expect(slugsB).not.toContain("bench-press-a-variant"); // not B's row
  });

  it("blocks a query for another user's data with no application-layer filter present", async () => {
    // Same query, run as each user — the only thing that differs is auth.uid().
    const query = (tx: TransactionSql) => tx`SELECT id FROM sessions WHERE user_id = ${USER_A}`;
    expect(await asUser(admin, USER_A, query)).toHaveLength(1);
    expect(await asUser(admin, USER_B, query)).toHaveLength(0);
  });

  it("rejects an UPDATE against sets at the database level", async () => {
    const sessionExercise = first(
      await admin<{ id: string }[]>`
      INSERT INTO session_exercises (user_id, session_id, exercise_id)
      SELECT ${USER_A}, id, ${exerciseId} FROM sessions WHERE user_id = ${USER_A} LIMIT 1
      RETURNING id
    `,
    );
    const set = first(
      await admin<{ id: string }[]>`
      INSERT INTO sets (user_id, session_exercise_id, set_index, weight, reps)
      VALUES (${USER_A}, ${sessionExercise.id}, 0, 100, 5)
      RETURNING id
    `,
    );

    await expect(admin`UPDATE sets SET weight = 105 WHERE id = ${set.id}`).rejects.toThrow(
      /immutable/,
    );
  });

  it("also has no UPDATE policy on sets for the authenticated role", async () => {
    // RLS with no matching UPDATE policy silently targets zero rows rather
    // than erroring, so this is a separate, weaker layer than the trigger
    // above — belt-and-suspenders, not a duplicate of it.
    const sessionExercise = first(
      await admin<{ id: string }[]>`
      INSERT INTO session_exercises (user_id, session_id, exercise_id)
      SELECT ${USER_A}, id, ${exerciseId} FROM sessions WHERE user_id = ${USER_A} LIMIT 1
      RETURNING id
    `,
    );
    const set = first(
      await admin<{ id: string }[]>`
      INSERT INTO sets (user_id, session_exercise_id, set_index, weight, reps)
      VALUES (${USER_A}, ${sessionExercise.id}, 1, 100, 5)
      RETURNING id
    `,
    );

    const result = await asUser(
      admin,
      USER_A,
      (tx) => tx`UPDATE sets SET weight = 105 WHERE id = ${set.id}`,
    );
    expect(result.count).toBe(0);

    const unchanged = first(
      await admin<{ weight: string }[]>`
      SELECT weight FROM sets WHERE id = ${set.id}
    `,
    );
    expect(unchanged.weight).toBe("100.00");
  });
});
