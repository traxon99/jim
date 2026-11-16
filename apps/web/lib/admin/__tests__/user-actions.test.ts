import { resetTestDb } from "@/lib/test/test-db";
import { type Db, createDb } from "@jim/db";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminSetRole,
  adminSetSignInDisabled,
  adminUpdateProfile,
  adminUpdateSettings,
} from "../user-actions";
import { listAdminUsers, loadAdminUser } from "../users-data";

const ADMIN = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const MAYA = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const THEO = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const actor = { id: ADMIN };

describe.skipIf(!process.env.TEST_DATABASE_URL)("admin user actions (#807)", () => {
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
    await owner`UPDATE users SET role = 'admin' WHERE id = ${ADMIN}`;
    await owner`INSERT INTO auth.sessions (user_id) VALUES (${MAYA})`;
  }, 30_000);

  afterAll(async () => {
    await owner.end();
  });

  async function audit(target: string) {
    return owner<
      { action: string; field: string | null; old_value: unknown; new_value: unknown }[]
    >`
      SELECT action, field, old_value, new_value FROM admin_audit
      WHERE target_user_id = ${target} ORDER BY created_at, id`;
  }

  it("changes settings and audits only the fields that changed", async () => {
    const result = await adminUpdateSettings(db, actor, MAYA, { units: "kg", showRpe: true });
    expect(result).toEqual({ ok: true });
    const user = await loadAdminUser(MAYA, db);
    expect(user?.settings.units).toBe("kg");
    const rows = await audit(MAYA);
    expect(rows).toEqual([
      { action: "settings.update", field: "units", old_value: "lb", new_value: "kg" },
    ]);
  });

  it("rejects settings PATCH /api/settings would reject", async () => {
    expect(await adminUpdateSettings(db, actor, MAYA, { units: "stone" })).toEqual({
      ok: false,
      error: "Invalid settings",
    });
    expect(await adminUpdateSettings(db, actor, MAYA, { role: "admin" })).toEqual({
      ok: false,
      error: "Invalid settings",
    });
  });

  it("edits the profile, normalising the username and refusing a taken one", async () => {
    expect(await adminUpdateProfile(db, actor, MAYA, { username: "Maya.Lifts" })).toEqual({
      ok: true,
    });
    expect((await loadAdminUser(MAYA, db))?.username).toBe("maya.lifts");
    expect(await adminUpdateProfile(db, actor, THEO, { username: "maya.lifts" })).toEqual({
      ok: false,
      error: "That username is taken",
    });
    expect(await adminUpdateProfile(db, actor, THEO, { avatar: null })).toMatchObject({
      ok: false,
    });
  });

  it("sets User or Coach, never Admin, and never touches an admin", async () => {
    expect(await adminSetRole(db, actor, THEO, "coach")).toEqual({ ok: true });
    expect((await loadAdminUser(THEO, db))?.role).toBe("coach");
    expect(await adminSetRole(db, actor, THEO, "admin")).toMatchObject({ ok: false });
    expect(await adminSetRole(db, actor, ADMIN, "user")).toMatchObject({ ok: false });
    expect((await loadAdminUser(ADMIN, db))?.role).toBe("admin");
  });

  it("disables sign-in, ending sessions, and enables it again", async () => {
    expect(await adminSetSignInDisabled(db, actor, MAYA, true)).toEqual({ ok: true });
    expect((await loadAdminUser(MAYA, db))?.disabled).toBe(true);
    const sessions = await owner`SELECT 1 FROM auth.sessions WHERE user_id = ${MAYA}`;
    expect(sessions).toHaveLength(0);
    expect(await adminSetSignInDisabled(db, actor, MAYA, false)).toEqual({ ok: true });
    expect((await loadAdminUser(MAYA, db))?.disabled).toBe(false);
    expect(await adminSetSignInDisabled(db, actor, ADMIN, true)).toMatchObject({ ok: false });
    const actions = (await audit(MAYA)).map((row) => row.action);
    expect(actions).toContain("signin.disable");
    expect(actions).toContain("signin.enable");
  });

  it("lists and searches accounts", async () => {
    const all = await listAdminUsers();
    expect(all.rows.map((row) => row.email).sort()).toEqual([
      "admin@example.com",
      "maya@example.com",
      "theo@example.com",
    ]);
    const found = await listAdminUsers({ query: "maya" });
    expect(found.rows.map((row) => row.id)).toEqual([MAYA]);
    expect((await listAdminUsers({ query: "%" })).rows).toHaveLength(0);
  });
});
