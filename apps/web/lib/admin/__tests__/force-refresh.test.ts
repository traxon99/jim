import { resetTestDb } from "@/lib/test/test-db";
import { type Db, createDb } from "@jim/db";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { adminRequestAppUpdate, adminRequestLocalReset, sendRefreshPush } from "../force-refresh";

const ADMIN = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const MAYA = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const THEO = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const MISSING = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const actor = { id: ADMIN };

describe.skipIf(!process.env.TEST_DATABASE_URL)("admin force refresh (#808)", () => {
  let owner: postgres.Sql;
  let db: Db;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    owner = await resetTestDb();
    db = createDb(process.env.TEST_DATABASE_URL as string);
    for (const [id, email] of [
      [ADMIN, "admin@example.com"],
      [MAYA, "maya@example.com"],
      [THEO, "theo@example.com"],
    ] as const) {
      await owner`INSERT INTO auth.users (id, email) VALUES (${id}, ${email})`;
      await owner`INSERT INTO users (id, email) VALUES (${id}, ${email})`;
    }
    await owner`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES
        (${MAYA}, 'https://push.example/maya', 'k', 'a'),
        (${THEO}, 'https://push.example/theo', 'k', 'a')`;
  }, 30_000);

  afterAll(async () => {
    await owner.end();
  });

  async function stamps(id: string) {
    const [row] = await owner<
      { update_requested_at: string | null; reset_requested_at: string | null }[]
    >`
      SELECT update_requested_at, reset_requested_at FROM users WHERE id = ${id}`;
    return row;
  }

  it("stamps one account's update and audits it", async () => {
    expect(await adminRequestAppUpdate(db, actor, MAYA)).toEqual({ ok: true });
    expect((await stamps(MAYA))?.update_requested_at).not.toBeNull();
    expect((await stamps(THEO))?.update_requested_at).toBeNull();
    const rows = await owner`
      SELECT action, actor_id FROM admin_audit WHERE target_user_id = ${MAYA}`;
    expect(rows.map((row) => row.action)).toEqual(["app.update"]);
  });

  it("stamps everyone with one audit row", async () => {
    expect(await adminRequestAppUpdate(db, actor, null)).toEqual({ ok: true });
    expect((await stamps(THEO))?.update_requested_at).not.toBeNull();
    const rows = await owner<{ new_value: unknown }[]>`
      SELECT new_value FROM admin_audit WHERE action = 'app.update' AND target_user_id IS NULL`;
    expect(rows).toEqual([{ new_value: { accounts: 3 } }]);
  });

  it("stamps a reset and refuses an unknown account", async () => {
    expect(await adminRequestLocalReset(db, actor, THEO)).toEqual({ ok: true });
    expect((await stamps(THEO))?.reset_requested_at).not.toBeNull();
    expect(await adminRequestLocalReset(db, actor, MISSING)).toEqual({
      ok: false,
      error: "No such account",
    });
    expect(await adminRequestAppUpdate(db, actor, MISSING)).toEqual({
      ok: false,
      error: "No such account",
    });
  });

  it("pushes the refresh to the account's devices and drops expired ones", async () => {
    const send = vi.fn(async (sub: { endpoint: string }, payload: string) => {
      expect(JSON.parse(payload).tag).toBe("jim-refresh");
      if (sub.endpoint.endsWith("theo"))
        throw Object.assign(new Error("gone"), { statusCode: 410 });
    });
    expect(await sendRefreshPush(db, MAYA, send)).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await sendRefreshPush(db, null, send)).toBe(1);
    const left = await owner`SELECT endpoint FROM push_subscriptions ORDER BY endpoint`;
    expect(left.map((row) => row.endpoint)).toEqual(["https://push.example/maya"]);
  });
});
