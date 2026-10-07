import type postgres from "postgres";
import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, first, resetTestDb } from "./test-db";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

interface LinkRow {
  id: string;
  kind: string;
  name: string;
  snapshot: { secret?: string };
  username: string;
  is_mine: boolean;
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("share links (issue #254)", () => {
  let admin: postgres.Sql;
  let linkId: string;

  function commitAs<T>(userId: string, fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
    return admin.begin(async (tx) => {
      await tx.unsafe("SET LOCAL role authenticated");
      await tx.unsafe(`SET LOCAL request.jwt.claim.sub = '${userId}'`);
      return fn(tx);
    }) as Promise<T>;
  }

  function open(userId: string | null, id: string) {
    return asUser(admin, userId, (tx) => tx<LinkRow[]>`SELECT * FROM get_share_link(${id})`);
  }

  beforeAll(async () => {
    admin = await resetTestDb();
    await admin`INSERT INTO auth.users (id, email) VALUES
      (${USER_A}, 'alice@example.com'), (${USER_B}, 'bob@example.com')`;
    await admin`INSERT INTO public.users (id, email) VALUES
      (${USER_A}, 'alice@example.com'), (${USER_B}, 'bob@example.com')`;
    await admin`INSERT INTO routines (user_id, name, device_id) VALUES (${USER_A}, 'Private', 'a')`;
    linkId = first(
      await commitAs(
        USER_A,
        (tx) => tx<{ id: string }[]>`
          INSERT INTO share_links (user_id, kind, name, snapshot)
          VALUES (${USER_A}, 'routine', 'Push', '{"secret":"push"}'::jsonb) RETURNING id`,
      ),
    ).id;
  }, 30_000);

  afterAll(async () => {
    await admin.end();
  });

  it("won't let a user create a link as someone else", async () => {
    await expect(
      commitAs(
        USER_B,
        (tx) => tx`
          INSERT INTO share_links (user_id, kind, name, snapshot)
          VALUES (${USER_A}, 'routine', 'Fake', '{}'::jsonb)`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("opens a link for another user, with nothing else of the sharer's", async () => {
    const [row] = await open(USER_B, linkId);
    expect(row).toMatchObject({ kind: "routine", name: "Push", is_mine: false });
    expect(row?.snapshot.secret).toBe("push");
    expect(row?.username).toBe("alice");
    // The table itself and the sharer's routines stay private.
    const tables = await asUser(admin, USER_B, async (tx) => ({
      links: await tx`SELECT * FROM share_links`,
      routines: await tx`SELECT * FROM routines`,
    }));
    expect(tables.links).toHaveLength(0);
    expect(tables.routines).toHaveLength(0);
  });

  it("marks the sharer's own link as theirs", async () => {
    expect(first(await open(USER_A, linkId)).is_mine).toBe(true);
  });

  it("can't be opened signed out or changed after it's written", async () => {
    expect(await open(null, linkId)).toHaveLength(0);
    await expect(
      commitAs(USER_A, (tx) => tx`UPDATE share_links SET name = 'Changed' WHERE id = ${linkId}`),
    ).resolves.toHaveLength(0);
    expect(first(await open(USER_B, linkId)).name).toBe("Push");
  });

  it("stops working once revoked, and only the sharer can revoke it", async () => {
    await commitAs(USER_B, (tx) => tx`DELETE FROM share_links WHERE id = ${linkId}`);
    expect(await open(USER_B, linkId)).toHaveLength(1);
    await commitAs(USER_A, (tx) => tx`DELETE FROM share_links WHERE id = ${linkId}`);
    expect(await open(USER_B, linkId)).toHaveLength(0);
  });
});
