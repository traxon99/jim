import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, first, resetTestDb } from "./test-db";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_C = "33333333-3333-3333-3333-333333333333";

describe.skipIf(!process.env.TEST_DATABASE_URL)("account roles and admin_audit (#806)", () => {
  let owner: postgres.Sql;

  beforeAll(async () => {
    owner = await resetTestDb();
    await owner`INSERT INTO auth.users (id, email) VALUES (${USER_A}, 'a@example.com'), (${USER_C}, 'c@example.com')`;
    await owner`INSERT INTO public.users (id, email) VALUES (${USER_A}, 'a@example.com')`;
  }, 30_000);

  afterAll(async () => {
    await owner.end();
  });

  it("gives every account the user role by default", async () => {
    const row = first(await owner<{ role: string }[]>`SELECT role FROM users WHERE id = ${USER_A}`);
    expect(row.role).toBe("user");
  });

  it("rejects a signed-in user promoting themselves", async () => {
    await expect(
      asUser(owner, USER_A, (tx) => tx`UPDATE users SET role = 'admin' WHERE id = ${USER_A}`),
    ).rejects.toThrow(/users\.role/);
  });

  it("still lets a signed-in user update their other settings", async () => {
    // asUser rolls back, so read the change inside the same transaction.
    const rows = await asUser(
      owner,
      USER_A,
      (tx) => tx`UPDATE users SET units = 'kg' WHERE id = ${USER_A} RETURNING units`,
    );
    expect(rows[0]?.units).toBe("kg");
  });

  it("rejects a signed-in user creating their row with a role", async () => {
    await expect(
      asUser(
        owner,
        USER_C,
        (tx) =>
          tx`INSERT INTO users (id, email, role) VALUES (${USER_C}, 'c@example.com', 'admin')`,
      ),
    ).rejects.toThrow(/users\.role/);
    const created = await asUser(
      owner,
      USER_C,
      (tx) => tx`INSERT INTO users (id, email) VALUES (${USER_C}, 'c@example.com') RETURNING role`,
    );
    expect(created[0]?.role).toBe("user");
  });

  it("lets the server's own connection set a role", async () => {
    await owner`UPDATE users SET role = 'coach' WHERE id = ${USER_A}`;
    const row = first(await owner<{ role: string }[]>`SELECT role FROM users WHERE id = ${USER_A}`);
    expect(row.role).toBe("coach");
  });

  it("hides admin_audit from signed-in users", async () => {
    await owner`INSERT INTO admin_audit (actor_id, target_user_id, action) VALUES (${USER_A}, ${USER_A}, 'role.set')`;
    const rows = await asUser(owner, USER_A, (tx) => tx`SELECT * FROM admin_audit`);
    expect(rows).toHaveLength(0);
    await expect(
      asUser(owner, USER_A, (tx) => tx`INSERT INTO admin_audit (action) VALUES ('x')`),
    ).rejects.toThrow();
  });
});
