import type postgres from "postgres";
import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, first, resetTestDb } from "./test-db";

// Comments on workouts and posts (issue #749, migration 0063).

const OWNER = "11111111-1111-1111-1111-111111111111";
const FRIEND = "22222222-2222-2222-2222-222222222222";
const STRANGER = "33333333-3333-3333-3333-333333333333";

interface CommentRow {
  comment_id: string;
  username: string;
  body: string;
  mine: boolean;
  can_delete: boolean;
  reactions: { kind: string; count: number; mine: boolean }[];
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("comments", () => {
  let admin: postgres.Sql;
  let sessionId: string;
  let postId: string;
  let inProgressId: string;

  function commitAs<T>(userId: string, fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
    return admin.begin(async (tx) => {
      await tx.unsafe("SET LOCAL role authenticated");
      await tx.unsafe(`SET LOCAL request.jwt.claim.sub = '${userId}'`);
      return fn(tx);
    }) as Promise<T>;
  }

  async function add(userId: string, target: { session?: string; post?: string }, body: string) {
    const rows = await commitAs(
      userId,
      (tx) => tx<{ id: string | null }[]>`
        SELECT add_comment(${target.session ?? null}::uuid, ${target.post ?? null}::uuid, ${body}) AS id`,
    );
    return first(rows).id;
  }

  function list(userId: string, target: { session?: string; post?: string }) {
    return asUser(
      admin,
      userId,
      (tx) => tx<CommentRow[]>`
        SELECT * FROM list_comments(${target.session ?? null}::uuid, ${target.post ?? null}::uuid)`,
    );
  }

  beforeAll(async () => {
    admin = await resetTestDb();
    await admin`INSERT INTO auth.users (id, email) VALUES
      (${OWNER}, 'owner@example.com'), (${FRIEND}, 'friend@example.com'),
      (${STRANGER}, 'stranger@example.com')`;
    await admin`INSERT INTO public.users (id, email) VALUES
      (${OWNER}, 'owner@example.com'), (${FRIEND}, 'friend@example.com'),
      (${STRANGER}, 'stranger@example.com')`;
    await admin`INSERT INTO friendships (requester_id, addressee_id, status, accepted_at)
      VALUES (${OWNER}, ${FRIEND}, 'accepted', now())`;
    sessionId = first(
      await admin<{ id: string }[]>`
        INSERT INTO sessions (user_id, name, device_id, started_at, ended_at)
        VALUES (${OWNER}, 'Push Day', 'o', now() - interval '1 hour', now()) RETURNING id`,
    ).id;
    inProgressId = first(
      await admin<{ id: string }[]>`
        INSERT INTO sessions (user_id, name, device_id) VALUES (${OWNER}, 'Now', 'o') RETURNING id`,
    ).id;
    postId = first(
      await admin<{ id: string }[]>`
        INSERT INTO posts (user_id, kind, title, detail)
        VALUES (${OWNER}, 'record', 'Deadlift', 'Estimated 1RM · 405 lb') RETURNING id`,
    ).id;
  }, 30_000);

  afterAll(async () => {
    await admin.end();
  });

  it("lets a friend and the owner comment on a workout and a post", async () => {
    expect(await add(FRIEND, { session: sessionId }, "  bar speed 👀 ")).toBeTruthy();
    expect(await add(OWNER, { session: sessionId }, "thanks @friend")).toBeTruthy();
    expect(await add(FRIEND, { post: postId }, "Four plates!")).toBeTruthy();

    const thread = await list(FRIEND, { session: sessionId });
    expect(thread.map((c) => [c.username, c.body, c.mine, c.can_delete])).toEqual([
      ["friend", "bar speed 👀", true, true],
      ["owner", "thanks @friend", false, false],
    ]);
    // The owner may delete anything on their own workout.
    const asOwner = await list(OWNER, { session: sessionId });
    expect(asOwner.map((c) => c.can_delete)).toEqual([true, true]);
    expect(await list(FRIEND, { post: postId })).toHaveLength(1);
  });

  it("keeps strangers, unfinished workouts and bad text out", async () => {
    expect(await add(STRANGER, { session: sessionId }, "hi")).toBeNull();
    expect(await list(STRANGER, { session: sessionId })).toHaveLength(0);
    expect(await add(FRIEND, { session: inProgressId }, "go!")).toBeNull();
    await expect(add(FRIEND, { session: sessionId }, "   ")).rejects.toThrow(/invalid comment/);
    await expect(add(FRIEND, { session: sessionId }, "x".repeat(501))).rejects.toThrow(
      /invalid comment/,
    );
    await expect(add(FRIEND, { session: sessionId, post: postId }, "both")).rejects.toThrow(
      /invalid comment/,
    );
  });

  it("doesn't let anyone write comments directly", async () => {
    const inserted = await asUser(admin, FRIEND, async (tx) => {
      await tx`INSERT INTO comments (user_id, session_id, body) VALUES (${FRIEND}, ${sessionId}, 'x')`;
    }).catch((error: Error) => error);
    expect(inserted).toBeInstanceOf(Error);
  });

  it("keeps one reaction per person per comment", async () => {
    const [comment] = await list(OWNER, { session: sessionId });
    if (!comment) throw new Error("missing comment");
    const react = async (kind: string) =>
      first(
        await commitAs(
          OWNER,
          (tx) => tx<{ r: boolean | null }[]>`
            SELECT set_comment_reaction(${comment.comment_id}, ${kind}) AS r`,
        ),
      ).r;

    expect(await react("fire")).toBe(true);
    expect(await react("clap")).toBe(true);
    let [seen] = await list(FRIEND, { session: sessionId });
    expect(seen?.reactions).toEqual([{ kind: "clap", count: 1, mine: false }]);
    expect(await react("clap")).toBe(false);
    [seen] = await list(FRIEND, { session: sessionId });
    expect(seen?.reactions).toEqual([]);

    const stranger = await asUser(
      admin,
      STRANGER,
      (tx) => tx<{ r: boolean | null }[]>`
        SELECT set_comment_reaction(${comment.comment_id}, 'fire') AS r`,
    );
    expect(first(stranger).r).toBeNull();
  });

  it("summarizes counts and the newest comment for the feed", async () => {
    const rows = await asUser(
      admin,
      FRIEND,
      (tx) => tx<{ session_id: string | null; comment_count: number; latest_body: string }[]>`
        SELECT * FROM comment_summaries(${[sessionId]}::uuid[], ${[postId]}::uuid[])
        ORDER BY post_id NULLS FIRST`,
    );
    expect(rows.map((r) => [r.comment_count, r.latest_body])).toEqual([
      [2, "thanks @friend"],
      [1, "Four plates!"],
    ]);
    const none = await asUser(
      admin,
      STRANGER,
      (tx) => tx`SELECT * FROM comment_summaries(${[sessionId]}::uuid[], NULL)`,
    );
    expect(none).toHaveLength(0);
  });

  it("lets the author and the owner delete, nobody else", async () => {
    const thread = await list(OWNER, { session: sessionId });
    const [friendsComment, ownersComment] = thread;
    if (!friendsComment || !ownersComment) throw new Error("missing comments");
    const del = async (userId: string, id: string) =>
      first(
        await commitAs(userId, (tx) => tx<{ ok: boolean }[]>`SELECT delete_comment(${id}) AS ok`),
      ).ok;

    expect(await del(STRANGER, friendsComment.comment_id)).toBe(false);
    expect(await del(FRIEND, ownersComment.comment_id)).toBe(false);
    expect(await del(OWNER, friendsComment.comment_id)).toBe(true);
    expect(await del(OWNER, ownersComment.comment_id)).toBe(true);
    expect(await list(FRIEND, { session: sessionId })).toHaveLength(0);
  });
});
