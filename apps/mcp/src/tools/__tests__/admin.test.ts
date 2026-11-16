import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { UserContext } from "../../context.js";
import { createMcpServer } from "../../server.js";
import { USER_A, USER_B, resetTestDb, testContext } from "../../test/test-db.js";
import {
  ADMIN_ONLY_MESSAGE,
  adminAuditLog,
  adminFeedback,
  adminGetUser,
  adminHealth,
  adminListUsers,
  adminOverview,
  adminRequestUpdate,
  adminSendPasswordReset,
  adminSetUserRole,
  adminSetUserSignIn,
  adminUpdateUserSettings,
  isAdmin,
} from "../admin.js";

// USER_A is the admin; USER_B is the account being looked after.
describe.skipIf(!process.env.TEST_DATABASE_URL)("MCP admin tools (#811)", () => {
  let owner: postgres.Sql;
  let admin: UserContext;
  let user: UserContext;

  beforeAll(async () => {
    owner = await resetTestDb();
    await owner`UPDATE users SET role = 'admin' WHERE id = ${USER_A}`;
    await owner`UPDATE users SET username = 'bee' WHERE id = ${USER_B}`;
    admin = testContext(USER_A);
    user = testContext(USER_B);
  }, 30_000);

  afterAll(async () => {
    await owner.end();
  });

  async function settingsOf(id: string) {
    const [row] = await owner<{ units: string; role: string }[]>`
      SELECT units, role FROM users WHERE id = ${id}`;
    return row;
  }

  it("refuses a non-admin, and an admin whose role was taken away mid-session", async () => {
    expect(await isAdmin(admin.db, USER_A)).toBe(true);
    expect(await isAdmin(user.db, USER_B)).toBe(false);
    await expect(adminOverview(user, {})).rejects.toThrow(ADMIN_ONLY_MESSAGE);
    await expect(adminListUsers(user, {})).rejects.toThrow(ADMIN_ONLY_MESSAGE);
    await expect(
      adminUpdateUserSettings(user, { user: USER_A, settings: { units: "kg" }, dryRun: false }),
    ).rejects.toThrow(ADMIN_ONLY_MESSAGE);

    // Listed as an admin, then demoted by script: the next call is refused.
    const server = createMcpServer({ ...admin, isAdmin: true });
    const client = new Client({ name: "test", version: "0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(b), client.connect(a)]);
    await owner`UPDATE users SET role = 'user' WHERE id = ${USER_A}`;
    const result = await client.callTool({ name: "admin_list_users", arguments: {} });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]?.text).toBe(ADMIN_ONLY_MESSAGE);
    await owner`UPDATE users SET role = 'admin' WHERE id = ${USER_A}`;
    await client.close();
    await server.close();
  });

  it("reads the same data as /admin", async () => {
    const overview = await adminOverview(admin, { range: "7d" });
    expect(overview.range).toBe("7d");
    expect(overview.days).toHaveLength(7);
    const { rows } = await adminListUsers(admin, { query: "b@" });
    expect(rows.map((row) => row.id)).toEqual([USER_B]);
    // By id, email or username.
    for (const ref of [USER_B, "B@example.com", "@bee"]) {
      expect((await adminGetUser(admin, { user: ref }))?.id).toBe(USER_B);
    }
    await expect(adminGetUser(admin, { user: "nobody" })).rejects.toThrow("No account matches");
  });

  it("previews a settings change without writing it, then writes and audits it", async () => {
    const preview = await adminUpdateUserSettings(admin, {
      user: USER_B,
      settings: { units: "kg" },
      dryRun: true,
    });
    expect(preview).toEqual({
      dryRun: true,
      changes: [
        expect.objectContaining({ action: "settings.update", field: "units", newValue: "kg" }),
      ],
    });
    expect((await settingsOf(USER_B))?.units).toBe("lb");

    const done = await adminUpdateUserSettings(admin, {
      user: USER_B,
      settings: { units: "kg" },
      dryRun: false,
    });
    expect(done.dryRun).toBe(false);
    expect(done.changes).toHaveLength(1);
    expect((await settingsOf(USER_B))?.units).toBe("kg");
    const log = await adminAuditLog(admin, { limit: 5 });
    expect(log[0]).toMatchObject({ action: "settings.update", field: "units", via: "mcp" });

    await expect(
      adminUpdateUserSettings(admin, { user: USER_B, settings: { units: "stone" }, dryRun: false }),
    ).rejects.toThrow("Invalid settings");
  });

  it("holds the same rules as the web: no admin by MCP, no disabling yourself", async () => {
    await expect(
      adminSetUserRole(admin, { user: USER_B, role: "admin", dryRun: false }),
    ).rejects.toThrow("Only User or Coach");
    await adminSetUserRole(admin, { user: USER_B, role: "coach", dryRun: false });
    expect((await settingsOf(USER_B))?.role).toBe("coach");
    await expect(
      adminSetUserSignIn(admin, { user: USER_A, disabled: true, dryRun: false }),
    ).rejects.toThrow("your own sign-in");

    const preview = await adminSetUserSignIn(admin, { user: USER_B, disabled: true, dryRun: true });
    expect(preview.changes.map((change) => change.action)).toEqual(["signin.disable"]);
    const [banned] = await owner<{ banned_until: string | null }[]>`
      SELECT banned_until FROM auth.users WHERE id = ${USER_B}`;
    expect(banned?.banned_until).toBeNull();
  });

  it("asks everyone's phones to update only when committed", async () => {
    const preview = await adminRequestUpdate(admin, { dryRun: true });
    expect(preview.changes[0]).toMatchObject({ action: "app.update", targetUserId: null });
    const [row] = await owner<{ n: number }[]>`
      SELECT count(*)::int AS n FROM users WHERE update_requested_at IS NOT NULL`;
    expect(row?.n).toBe(0);
  });

  it("sends a password reset to the account's address and audits it", async () => {
    vi.stubEnv("JIM_WEB_URL", "https://jim.example");
    const send = vi.fn(async () => ({ error: null }));
    expect(await adminSendPasswordReset(admin, { user: "bee", dryRun: true }, send)).toEqual({
      dryRun: true,
      email: "b@example.com",
    });
    expect(send).not.toHaveBeenCalled();
    await adminSendPasswordReset(admin, { user: "bee", dryRun: false }, send);
    expect(send).toHaveBeenCalledWith(
      "b@example.com",
      "https://jim.example/auth/confirm?next=%2Freset-password",
    );
    const log = await adminAuditLog(admin, { limit: 1 });
    expect(log[0]).toMatchObject({ action: "password.reset_email", via: "mcp" });
    vi.unstubAllEnvs();
  });

  it("says what's missing for feedback and probes the web app for health", async () => {
    vi.stubEnv("GITHUB_FEEDBACK_REPO", "");
    await expect(adminFeedback(admin, {})).rejects.toThrow("isn't set up");
    vi.unstubAllEnvs();
    const health = await adminHealth(admin, {
      self: { name: "jim-mcp", detail: "Fly", state: "healthy" },
      peer: { name: "Web app", host: "Vercel", origin: null, path: "/api/healthz" },
      deploy: { version: "mcp", commit: null, region: null, builtAt: null },
    });
    expect(health.services.map((service) => [service.name, service.state])).toContainEqual([
      "Web app",
      "not_configured",
    ]);
    expect(health.databaseBytes).toBeGreaterThan(0);
  });
});
