import { resetTestDb } from "@/lib/test/test-db";
import { hashAccessToken } from "@jim/core";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

const claims = { sub: USER_A, email: "alice@example.com" };
function signInAs(userId: string, email: string) {
  claims.sub = userId;
  claims.email = email;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims } }) },
  }),
}));

const route = await import("../route");

function jsonRequest(method: string, body: unknown) {
  return new Request("http://localhost/api/access-tokens", {
    method,
    body: JSON.stringify(body),
  });
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("/api/access-tokens", () => {
  let admin: postgres.Sql;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    admin = await resetTestDb();
    await admin`INSERT INTO auth.users (id, email) VALUES
      (${USER_A}, 'alice@example.com'), (${USER_B}, 'bob@example.com')`;
  }, 30_000);

  afterAll(async () => {
    await admin.end();
  });

  it("creates a token, returning the plaintext once and storing only its hash", async () => {
    signInAs(USER_A, "alice@example.com");
    const response = await route.POST(
      jsonRequest("POST", { name: "  Nightly script ", expiresInDays: 30 }),
    );
    const { token, entry } = await response.json();

    expect(token).toMatch(/^jim_pat_/);
    expect(entry).toMatchObject({ name: "Nightly script", prefix: token.slice(0, 12) });
    expect(new Date(entry.expiresAt).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);

    const [row] = await admin`SELECT * FROM personal_access_tokens WHERE id = ${entry.id}`;
    expect(row?.token_hash).toBe(await hashAccessToken(token));
    expect(JSON.stringify(row)).not.toContain(token);

    const list = await (await route.GET()).json();
    expect(list.tokens).toEqual([entry]);
  });

  it("validates the name and expiry", async () => {
    signInAs(USER_A, "alice@example.com");
    const noName = await route.POST(jsonRequest("POST", { name: " ", expiresInDays: 30 }));
    expect(noName.status).toBe(400);
    const badExpiry = await route.POST(jsonRequest("POST", { name: "x", expiresInDays: 7 }));
    expect(badExpiry.status).toBe(400);
    const never = await route.POST(jsonRequest("POST", { name: "Forever", expiresInDays: null }));
    expect((await never.json()).entry.expiresAt).toBeNull();
  });

  it("only lists and revokes the signed-in user's own tokens", async () => {
    signInAs(USER_A, "alice@example.com");
    const { tokens: aTokens } = await (await route.GET()).json();
    const target = aTokens[0].id;

    signInAs(USER_B, "bob@example.com");
    expect((await (await route.GET()).json()).tokens).toEqual([]);
    const bRevoke = await route.DELETE(jsonRequest("DELETE", { id: target }));
    expect(await bRevoke.json()).toEqual({ ok: false });

    signInAs(USER_A, "alice@example.com");
    const aRevoke = await route.DELETE(jsonRequest("DELETE", { id: target }));
    expect(await aRevoke.json()).toEqual({ ok: true });
    const after = (await (await route.GET()).json()).tokens.map((t: { id: string }) => t.id);
    expect(after).not.toContain(target);
    const [row] = await admin`SELECT revoked_at FROM personal_access_tokens WHERE id = ${target}`;
    expect(row?.revoked_at).not.toBeNull();
  });
});
