import type postgres from "postgres";
import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, first, resetTestDb } from "./test-db";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const USER_C = "33333333-3333-3333-3333-333333333333";
const USER_D = "44444444-4444-4444-4444-444444444444";

describe.skipIf(!process.env.TEST_DATABASE_URL)("social activity and suggestions", () => {
  let admin: postgres.Sql;
  let sessionId: string;

  function commitAs<T>(userId: string, fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
    return admin.begin(async (tx) => {
      await tx.unsafe("SET LOCAL role authenticated");
      await tx.unsafe(`SET LOCAL request.jwt.claim.sub = '${userId}'`);
      return fn(tx);
    }) as Promise<T>;
  }

  beforeAll(async () => {
    admin = await resetTestDb();
    await admin`INSERT INTO auth.users (id, email) VALUES
      (${USER_A}, 'alice@example.com'), (${USER_B}, 'bob@example.com'),
      (${USER_C}, 'carol@example.com'), (${USER_D}, 'dave@example.com')`;
    await admin`INSERT INTO public.users (id, email) VALUES
      (${USER_A}, 'alice@example.com'), (${USER_B}, 'bob@example.com'),
      (${USER_C}, 'carol@example.com'), (${USER_D}, 'dave@example.com')`;

    await admin`INSERT INTO friendships (requester_id, addressee_id, status, accepted_at) VALUES
      (${USER_A}, ${USER_B}, 'accepted', now()),
      (${USER_B}, ${USER_C}, 'accepted', now())`;

    const session = first(
      await admin<{ id: string }[]>`
        INSERT INTO sessions (user_id, name, device_id, started_at, ended_at)
        VALUES (${USER_A}, 'Push', 'a', now() - interval '1 hour', now()) RETURNING id`,
    );
    sessionId = session.id;
  }, 30_000);

  afterAll(async () => {
    await admin.end();
  });

  it("lists reactions and friend requests, then clears unread when marked seen", async () => {
    await commitAs(
      USER_C,
      (tx) =>
        tx`INSERT INTO workout_reactions (session_id, user_id, kind) VALUES (${sessionId}, ${USER_C}, 'strong')`,
    );
    await commitAs(USER_D, (tx) => tx`SELECT send_friend_request('alice')`);

    const unreadBefore = await asUser(
      admin,
      USER_A,
      (tx) => tx<{ has_unread: boolean }[]>`SELECT activity_has_unread() AS has_unread`,
    );
    expect(unreadBefore[0]?.has_unread).toBe(true);

    const activity = await asUser(admin, USER_A, (tx) => tx`SELECT * FROM list_activity()`);
    expect(activity.map((row) => row.kind).sort()).toEqual(["friend_request", "workout_reaction"]);

    await commitAs(USER_A, (tx) => tx`SELECT mark_activity_seen()`);

    const unreadAfter = await asUser(
      admin,
      USER_A,
      (tx) => tx<{ has_unread: boolean }[]>`SELECT activity_has_unread() AS has_unread`,
    );
    expect(unreadAfter[0]?.has_unread).toBe(false);
  });

  it("suggests friends of friends and remembers dismissals", async () => {
    const suggestions = await asUser(admin, USER_A, (tx) => tx`SELECT * FROM friend_suggestions()`);
    expect(suggestions).toMatchObject([{ user_id: USER_C, mutual_count: 1 }]);

    await commitAs(USER_A, (tx) => tx`SELECT dismiss_friend_suggestion(${USER_C})`);
    const afterDismiss = await asUser(
      admin,
      USER_A,
      (tx) => tx`SELECT * FROM friend_suggestions()`,
    );
    expect(afterDismiss).toHaveLength(0);

    await admin`UPDATE users SET discoverable_by_friends_of_friends = false WHERE id = ${USER_C}`;
    await admin`DELETE FROM dismissed_friend_suggestions WHERE user_id = ${USER_A}`;
    const hidden = await asUser(admin, USER_A, (tx) => tx`SELECT * FROM friend_suggestions()`);
    expect(hidden).toHaveLength(0);
  });
});
