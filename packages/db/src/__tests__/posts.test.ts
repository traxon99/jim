import type postgres from "postgres";
import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, first, resetTestDb } from "./test-db";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const USER_C = "33333333-3333-3333-3333-333333333333";

interface PostRow {
  post_id: string;
  username: string;
  avatar: string | null;
  kind: string;
  session_id: string | null;
  title: string;
  caption: string | null;
}

interface WorkoutRow {
  session_id: string;
  avatar: string | null;
  exercises: unknown[];
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("posts and sharing settings", () => {
  let admin: postgres.Sql;
  let finishedId: string;
  let inProgressId: string;

  function commitAs<T>(userId: string, fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
    return admin.begin(async (tx) => {
      await tx.unsafe("SET LOCAL role authenticated");
      await tx.unsafe(`SET LOCAL request.jwt.claim.sub = '${userId}'`);
      return fn(tx);
    }) as Promise<T>;
  }

  async function createPost(
    userId: string,
    kind: string,
    sessionId: string | null,
    title: string,
    caption: string | null = null,
  ) {
    const rows = await commitAs(
      userId,
      (tx) => tx<{ id: string | null }[]>`
        SELECT create_post(${kind}, ${sessionId}, ${title}, ${null}, ${caption}) AS id`,
    );
    return first(rows).id;
  }

  function postsSeenBy(userId: string) {
    return asUser(admin, userId, (tx) => tx<PostRow[]>`SELECT * FROM friend_posts()`);
  }

  function workoutsSeenBy(userId: string) {
    return asUser(admin, userId, (tx) => tx<WorkoutRow[]>`SELECT * FROM friend_workouts()`);
  }

  beforeAll(async () => {
    admin = await resetTestDb();
    await admin`INSERT INTO auth.users (id, email) VALUES
      (${USER_A}, 'alice@example.com'), (${USER_B}, 'bob@example.com'),
      (${USER_C}, 'carol@example.com')`;
    await admin`INSERT INTO public.users (id, email, avatar) VALUES
      (${USER_A}, 'alice@example.com', null),
      (${USER_B}, 'bob@example.com', 'data:image/jpeg;base64,AAAA'),
      (${USER_C}, 'carol@example.com', null)`;
    // A and B are friends; C is no one's friend.
    await admin`INSERT INTO friendships (requester_id, addressee_id, status, accepted_at) VALUES
      (${USER_A}, ${USER_B}, 'accepted', now())`;

    const bench = first(
      await admin<{ id: string }[]>`
        INSERT INTO exercises (slug, name, tracking_type, primary_muscles)
        VALUES ('bench-press', 'Bench Press', 'weight_reps', '{chest}') RETURNING id`,
    );
    finishedId = first(
      await admin<{ id: string }[]>`
        INSERT INTO sessions (user_id, name, device_id, started_at, ended_at)
        VALUES (${USER_B}, 'Push Day', 'b', now() - interval '1 hour', now()) RETURNING id`,
    ).id;
    inProgressId = first(
      await admin<{ id: string }[]>`
        INSERT INTO sessions (user_id, name, device_id) VALUES (${USER_B}, 'Now', 'b') RETURNING id`,
    ).id;
    const se = first(
      await admin<{ id: string }[]>`
        INSERT INTO session_exercises (user_id, session_id, exercise_id, position)
        VALUES (${USER_B}, ${finishedId}, ${bench.id}, 0) RETURNING id`,
    );
    await admin`INSERT INTO sets (user_id, session_exercise_id, set_index, weight, reps)
      VALUES (${USER_B}, ${se.id}, 0, 100, 5)`;
  }, 30_000);

  afterAll(async () => {
    await admin.end();
  });

  it("lets a user post their own finished workout, a record or an achievement", async () => {
    expect(await createPost(USER_B, "workout", finishedId, "Push Day", "Felt strong")).toBeTruthy();
    expect(await createPost(USER_B, "record", null, "Bench Press")).toBeTruthy();
    expect(await createPost(USER_B, "achievement", null, "First workout")).toBeTruthy();
  });

  it("won't link an unfinished or someone else's workout", async () => {
    expect(await createPost(USER_B, "workout", inProgressId, "Now")).toBeNull();
    expect(await createPost(USER_A, "workout", finishedId, "Push Day")).toBeNull();
  });

  it("rejects a post with no title or a mismatched session", async () => {
    await expect(createPost(USER_B, "record", null, "")).rejects.toThrow(/invalid post/);
    await expect(createPost(USER_B, "record", finishedId, "Bench")).rejects.toThrow(/invalid post/);
    await expect(createPost(USER_B, "workout", null, "Bench")).rejects.toThrow(/invalid post/);
  });

  it("shows a user's posts and picture to friends only, newest first", async () => {
    const posts = await postsSeenBy(USER_A);
    expect(posts.map((p) => p.title)).toEqual(["First workout", "Bench Press", "Push Day"]);
    expect(posts.every((p) => p.username === "bob")).toBe(true);
    expect(first(posts).avatar).toBe("data:image/jpeg;base64,AAAA");
    expect(posts.find((p) => p.kind === "workout")?.caption).toBe("Felt strong");

    expect(await postsSeenBy(USER_C)).toEqual([]);
    expect(await postsSeenBy(USER_B)).toEqual([]);
  });

  it("can't be read or written directly", async () => {
    await expect(
      commitAs(
        USER_A,
        (tx) => tx`INSERT INTO posts (user_id, kind, title) VALUES (${USER_A}, 'record', 'x')`,
      ),
    ).rejects.toThrow();
    const visible = await asUser(admin, USER_A, (tx) => tx`SELECT * FROM posts`);
    expect(visible).toEqual([]);
  });

  it("lets only the author delete a post", async () => {
    const id = await createPost(USER_B, "record", null, "Squat");
    const byA = await commitAs(
      USER_A,
      (tx) => tx<{ ok: boolean }[]>`SELECT delete_post(${id}) AS ok`,
    );
    expect(first(byA).ok).toBe(false);
    const byB = await commitAs(
      USER_B,
      (tx) => tx<{ ok: boolean }[]>`SELECT delete_post(${id}) AS ok`,
    );
    expect(first(byB).ok).toBe(true);
    expect((await postsSeenBy(USER_A)).map((p) => p.title)).not.toContain("Squat");
  });

  it("hides a workout's exercises when its owner stops sharing details", async () => {
    expect(first(await workoutsSeenBy(USER_A)).exercises).toHaveLength(1);
    expect(first(await workoutsSeenBy(USER_A)).avatar).toBe("data:image/jpeg;base64,AAAA");

    await admin`UPDATE users SET share_workout_details = false WHERE id = ${USER_B}`;
    const [workout] = await workoutsSeenBy(USER_A);
    expect(workout?.session_id).toBe(finishedId);
    expect(workout?.exercises).toEqual([]);
  });

  it("drops a friend's workouts, but not their posts, when they stop sharing workouts", async () => {
    await admin`UPDATE users SET share_workouts = false WHERE id = ${USER_B}`;
    expect(await workoutsSeenBy(USER_A)).toEqual([]);
    expect((await postsSeenBy(USER_A)).length).toBeGreaterThan(0);
  });

  it("drops a workout post once its workout is deleted", async () => {
    await admin`UPDATE sessions SET deleted_at = now() WHERE id = ${finishedId}`;
    expect((await postsSeenBy(USER_A)).map((p) => p.kind)).not.toContain("workout");
  });

  it("includes each friend's picture in the friend list", async () => {
    const friends = await asUser(
      admin,
      USER_A,
      (tx) => tx<{ username: string; avatar: string | null }[]>`SELECT * FROM list_friends()`,
    );
    expect(friends).toEqual([
      expect.objectContaining({ username: "bob", avatar: "data:image/jpeg;base64,AAAA" }),
    ]);
  });
});
