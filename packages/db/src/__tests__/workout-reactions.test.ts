import type postgres from "postgres";
import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, first, resetTestDb } from "./test-db";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const USER_C = "33333333-3333-3333-3333-333333333333";

interface Reaction {
  kind: string;
  count: number;
  mine: boolean;
}

interface ReceivedRow {
  session_id: string;
  session_name: string | null;
  username: string;
  kind: string;
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("workout reactions", () => {
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

  async function toggle(userId: string, sessionId: string, kind: string) {
    const rows = await commitAs(
      userId,
      (tx) => tx<{ r: boolean | null }[]>`
        SELECT toggle_workout_reaction(${sessionId}, ${kind}) AS r`,
    );
    return first(rows).r;
  }

  async function reactionsSeenBy(userId: string): Promise<Reaction[]> {
    const rows = await asUser(
      admin,
      userId,
      (tx) => tx<{ reactions: Reaction[] }[]>`SELECT reactions FROM friend_workouts()`,
    );
    return first(rows).reactions;
  }

  beforeAll(async () => {
    admin = await resetTestDb();
    await admin`INSERT INTO auth.users (id, email) VALUES
      (${USER_A}, 'alice@example.com'), (${USER_B}, 'bob@example.com'),
      (${USER_C}, 'carol@example.com')`;
    await admin`INSERT INTO public.users (id, email) VALUES
      (${USER_A}, 'alice@example.com'), (${USER_B}, 'bob@example.com'),
      (${USER_C}, 'carol@example.com')`;
    // A and B are friends; B and C are friends; A and C aren't.
    await admin`INSERT INTO friendships (requester_id, addressee_id, status, accepted_at) VALUES
      (${USER_A}, ${USER_B}, 'accepted', now()), (${USER_C}, ${USER_B}, 'accepted', now())`;

    finishedId = first(
      await admin<{ id: string }[]>`
        INSERT INTO sessions (user_id, name, device_id, started_at, ended_at)
        VALUES (${USER_B}, 'Push Day', 'b', now() - interval '1 hour', now()) RETURNING id`,
    ).id;
    inProgressId = first(
      await admin<{ id: string }[]>`
        INSERT INTO sessions (user_id, name, device_id) VALUES (${USER_B}, 'Now', 'b') RETURNING id`,
    ).id;
  }, 30_000);

  afterAll(async () => {
    await admin.end();
  });

  it("toggles a reaction on a friend's finished workout", async () => {
    expect(await toggle(USER_A, finishedId, "fire")).toBe(true);
    expect(await reactionsSeenBy(USER_A)).toEqual([{ kind: "fire", count: 1, mine: true }]);

    expect(await toggle(USER_A, finishedId, "fire")).toBe(false);
    expect(await reactionsSeenBy(USER_A)).toEqual([]);
  });

  it("counts every friend's reaction, and marks only the viewer's own", async () => {
    await toggle(USER_A, finishedId, "strong");
    await toggle(USER_C, finishedId, "strong");
    await toggle(USER_C, finishedId, "party");

    expect(await reactionsSeenBy(USER_A)).toEqual([
      { kind: "strong", count: 2, mine: true },
      { kind: "party", count: 1, mine: false },
    ]);
  });

  it("refuses reactions to a workout that isn't a friend's finished one", async () => {
    expect(await toggle(USER_A, inProgressId, "fire")).toBeNull();
    // B can't react to their own workout.
    expect(await toggle(USER_B, finishedId, "fire")).toBeNull();

    await admin`DELETE FROM friendships WHERE requester_id = ${USER_C}`;
    expect(await toggle(USER_C, finishedId, "clap")).toBeNull();
  });

  it("rejects an unknown reaction kind", async () => {
    await expect(toggle(USER_A, finishedId, "🔥")).rejects.toThrow(/reaction_kind/);
  });

  it("shows the owner who reacted to which workout", async () => {
    const rows = await asUser(
      admin,
      USER_B,
      (tx) => tx<ReceivedRow[]>`SELECT * FROM workout_reactions_received()`,
    );
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => `${r.username}:${r.kind}`).sort()).toEqual([
      "alice:strong",
      "carol:party",
      "carol:strong",
    ]);
    expect(first(rows)).toMatchObject({ session_id: finishedId, session_name: "Push Day" });

    const none = await asUser(
      admin,
      USER_A,
      (tx) => tx`SELECT * FROM workout_reactions_received()`,
    );
    expect(none).toHaveLength(0);
  });

  it("keeps reaction rows private and unwritable directly", async () => {
    const seen = await asUser(admin, USER_B, (tx) => tx`SELECT * FROM workout_reactions`);
    expect(seen).toHaveLength(0);

    const inserted = await asUser(admin, USER_A, async (tx) => {
      await tx`INSERT INTO workout_reactions (session_id, user_id, kind)
        VALUES (${finishedId}, ${USER_A}, 'clap')`;
    }).catch((error: Error) => error);
    expect(inserted).toBeInstanceOf(Error);
  });

  it("refuses anonymous callers", async () => {
    await expect(
      asUser(admin, null, (tx) => tx`SELECT toggle_workout_reaction(${finishedId}, 'fire')`),
    ).rejects.toThrow(/not authenticated/);
  });
});
