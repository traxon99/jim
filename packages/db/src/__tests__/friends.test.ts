import type postgres from "postgres";
import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, first, resetTestDb } from "./test-db";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const USER_C = "33333333-3333-3333-3333-333333333333";
const USER_D = "44444444-4444-4444-4444-444444444444";

interface FriendRow {
  user_id: string;
  username: string;
  status: string;
  direction: string | null;
}

interface WorkoutRow {
  session_id: string;
  username: string;
  units: string;
  name: string | null;
  exercises: { name: string; sets: number; topWeight: number | null; topReps: number | null }[];
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("friends", () => {
  let admin: postgres.Sql;
  let finishedSessionId: string;

  beforeAll(async () => {
    admin = await resetTestDb();

    await admin`INSERT INTO auth.users (id, email) VALUES
      (${USER_A}, 'Alice@example.com'), (${USER_B}, 'bob@example.com'),
      (${USER_C}, 'carol@example.com'), (${USER_D}, 'alice@other.com')`;
    await admin`INSERT INTO public.users (id, email) VALUES
      (${USER_A}, 'Alice@example.com'), (${USER_B}, 'bob@example.com'),
      (${USER_C}, 'carol@example.com'), (${USER_D}, 'alice@other.com')`;

    // B's finished workout: bench with an edited set and a deleted one, and
    // a squat with no sets left (dropped from the summary).
    const bench = first(
      await admin<{ id: string }[]>`
        INSERT INTO exercises (slug, name, tracking_type, primary_muscles)
        VALUES ('bench-press', 'Bench Press', 'weight_reps', '{chest}') RETURNING id`,
    );
    const squat = first(
      await admin<{ id: string }[]>`
        INSERT INTO exercises (slug, name, tracking_type, primary_muscles)
        VALUES ('squat', 'Squat', 'weight_reps', '{quadriceps}') RETURNING id`,
    );
    const session = first(
      await admin<{ id: string }[]>`
        INSERT INTO sessions (user_id, name, device_id, started_at, ended_at)
        VALUES (${USER_B}, 'Push Day', 'b', now() - interval '1 hour', now()) RETURNING id`,
    );
    finishedSessionId = session.id;
    await admin`INSERT INTO sessions (user_id, name, device_id) VALUES (${USER_B}, 'In progress', 'b')`;

    const benchSe = first(
      await admin<{ id: string }[]>`
        INSERT INTO session_exercises (user_id, session_id, exercise_id, position)
        VALUES (${USER_B}, ${session.id}, ${bench.id}, 0) RETURNING id`,
    );
    const squatSe = first(
      await admin<{ id: string }[]>`
        INSERT INTO session_exercises (user_id, session_id, exercise_id, position)
        VALUES (${USER_B}, ${session.id}, ${squat.id}, 1) RETURNING id`,
    );
    const original = first(
      await admin<{ id: string }[]>`
        INSERT INTO sets (user_id, session_exercise_id, set_index, weight, reps)
        VALUES (${USER_B}, ${benchSe.id}, 0, 300, 1) RETURNING id`,
    );
    await admin`INSERT INTO sets (user_id, session_exercise_id, set_index, weight, reps, supersedes_id)
      VALUES (${USER_B}, ${benchSe.id}, 0, 185, 5, ${original.id})`;
    await admin`INSERT INTO sets (user_id, session_exercise_id, set_index, weight, reps)
      VALUES (${USER_B}, ${benchSe.id}, 1, 175, 8)`;
    const squatSet = first(
      await admin<{ id: string }[]>`
        INSERT INTO sets (user_id, session_exercise_id, set_index, weight, reps)
        VALUES (${USER_B}, ${squatSe.id}, 0, 225, 5) RETURNING id`,
    );
    await admin`INSERT INTO sets (user_id, session_exercise_id, set_index, weight, reps, supersedes_id, deleted_at)
      VALUES (${USER_B}, ${squatSe.id}, 0, 225, 5, ${squatSet.id}, now())`;
  }, 30_000);

  /** Like asUser, but commits — for the steps later tests build on. */
  function commitAs<T>(userId: string, fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
    return admin.begin(async (tx) => {
      await tx.unsafe("SET LOCAL role authenticated");
      await tx.unsafe(`SET LOCAL request.jwt.claim.sub = '${userId}'`);
      return fn(tx);
    }) as Promise<T>;
  }

  afterAll(async () => {
    await admin.end();
  });

  it("gives every user their email's local part as a username, suffixed on a clash", async () => {
    const rows = await admin<{ id: string; username: string }[]>`
      SELECT id, username FROM users ORDER BY id`;
    expect(rows.map((r) => r.username)).toEqual(["alice", "bob", "carol", "alice2"]);
  });

  it("rejects a username another user already has", async () => {
    await expect(
      asUser(admin, USER_C, (tx) => tx`UPDATE users SET username = 'bob' WHERE id = ${USER_C}`),
    ).rejects.toThrow(/users_username/);
  });

  it("doesn't let anyone write friendships directly", async () => {
    const inserted = await asUser(admin, USER_A, async (tx) => {
      await tx`INSERT INTO friendships (requester_id, addressee_id, status)
        VALUES (${USER_A}, ${USER_B}, 'accepted')`;
    }).catch((error: Error) => error);
    expect(inserted).toBeInstanceOf(Error);
  });

  it("sends a request by exact username and shows it to both sides", async () => {
    const result = await commitAs(
      USER_A,
      (tx) => tx<{ r: string }[]>`SELECT send_friend_request('Bob') AS r`,
    );
    expect(first(result).r).toBe("sent");

    const asA = await asUser(admin, USER_A, (tx) => tx<FriendRow[]>`SELECT * FROM list_friends()`);
    expect(asA).toMatchObject([{ user_id: USER_B, username: "bob", direction: "outgoing" }]);
    const asB = await asUser(admin, USER_B, (tx) => tx<FriendRow[]>`SELECT * FROM list_friends()`);
    expect(asB).toMatchObject([{ user_id: USER_A, username: "alice", direction: "incoming" }]);

    const again = await asUser(
      admin,
      USER_A,
      (tx) => tx<{ r: string }[]>`SELECT send_friend_request('bob') AS r`,
    );
    expect(first(again).r).toBe("already_requested");
  });

  it("reports unknown and own usernames", async () => {
    const results = await asUser(
      admin,
      USER_A,
      (tx) => tx<{ missing: string; self: string }[]>`
        SELECT send_friend_request('bo') AS missing, send_friend_request('alice') AS self`,
    );
    expect(first(results)).toEqual({ missing: "not_found", self: "self" });
  });

  it("hides a friend's workouts until the request is accepted", async () => {
    const before = await asUser(
      admin,
      USER_A,
      (tx) => tx<WorkoutRow[]>`SELECT * FROM friend_workouts()`,
    );
    expect(before).toHaveLength(0);

    const accepted = await commitAs(
      USER_B,
      (tx) => tx<{ ok: boolean }[]>`SELECT respond_to_friend_request(${USER_A}, true) AS ok`,
    );
    expect(first(accepted).ok).toBe(true);

    const after = await asUser(
      admin,
      USER_A,
      (tx) => tx<WorkoutRow[]>`SELECT * FROM friend_workouts()`,
    );
    expect(after).toHaveLength(1);
    expect(first(after)).toMatchObject({
      session_id: finishedSessionId,
      username: "bob",
      units: "lb",
      name: "Push Day",
      exercises: [{ name: "Bench Press", sets: 2, topWeight: 185, topReps: 5 }],
    });
  });

  it("still keeps a friend's raw rows out of sync's RLS-scoped reads", async () => {
    const rows = await asUser(admin, USER_A, (tx) => tx`SELECT id FROM sessions`);
    expect(rows).toHaveLength(0);
    const sets = await asUser(admin, USER_A, (tx) => tx`SELECT id FROM sets`);
    expect(sets).toHaveLength(0);
  });

  it("shows nothing to someone who isn't a friend", async () => {
    const rows = await asUser(
      admin,
      USER_C,
      (tx) => tx<WorkoutRow[]>`SELECT * FROM friend_workouts()`,
    );
    expect(rows).toHaveLength(0);
    const friends = await asUser(admin, USER_C, (tx) => tx`SELECT * FROM list_friends()`);
    expect(friends).toHaveLength(0);
  });

  it("lets only the addressee answer a request", async () => {
    await commitAs(USER_C, (tx) => tx`SELECT send_friend_request('bob')`);
    // C can't accept its own request on B's behalf.
    const ok = await asUser(
      admin,
      USER_C,
      (tx) => tx<{ ok: boolean }[]>`SELECT respond_to_friend_request(${USER_B}, true) AS ok`,
    );
    expect(first(ok).ok).toBe(false);
    const workouts = await asUser(
      admin,
      USER_C,
      (tx) => tx<WorkoutRow[]>`SELECT * FROM friend_workouts()`,
    );
    expect(workouts).toHaveLength(0);
  });

  it("unfriends from either side", async () => {
    const removed = await asUser(
      admin,
      USER_B,
      (tx) => tx<{ ok: boolean }[]>`SELECT remove_friend(${USER_A}) AS ok`,
    );
    expect(first(removed).ok).toBe(true);
  });

  it("refuses anonymous callers", async () => {
    await expect(
      asUser(admin, null, (tx) => tx`SELECT send_friend_request('bob')`),
    ).rejects.toThrow(/not authenticated/);

    const anon = await admin
      .begin(async (tx) => {
        await tx.unsafe("SET LOCAL role anon");
        await tx`SELECT * FROM list_friends()`;
      })
      .catch((error: Error) => error);
    expect(anon).toBeInstanceOf(Error);
    expect((anon as Error).message).toMatch(/permission denied/);
  });
});
