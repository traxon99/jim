import { resetTestDb } from "@/lib/test/test-db";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

let claims: { sub: string; email: string } | null = { sub: USER_A, email: "a@example.com" };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: claims ? { claims } : null }) },
  }),
}));

const { POST, DELETE } = await import("../route");

const ENDPOINT = "https://push.example/device-1";

function request(method: "POST" | "DELETE", body: unknown) {
  return new Request("http://localhost/api/push/subscription", {
    method,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function subscription(auth = "auth-1") {
  return { endpoint: ENDPOINT, keys: { p256dh: "p256dh-1", auth } };
}

describe("POST/DELETE /api/push/subscription validation", () => {
  it("rejects malformed bodies before touching the database", async () => {
    expect((await POST(request("POST", "{"))).status).toBe(400);
    expect((await POST(request("POST", { endpoint: ENDPOINT }))).status).toBe(400);
    expect((await DELETE(request("DELETE", {}))).status).toBe(400);
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("POST/DELETE /api/push/subscription", () => {
  let admin: postgres.Sql;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    admin = await resetTestDb();
    await admin`INSERT INTO auth.users (id, email) VALUES (${USER_A}, 'a@example.com'), (${USER_B}, 'b@example.com')`;
  }, 30_000);

  afterAll(async () => {
    await admin.end();
  });

  it("401s without a session", async () => {
    claims = null;
    expect((await POST(request("POST", subscription()))).status).toBe(401);
    claims = { sub: USER_A, email: "a@example.com" };
  });

  it("stores a subscription, creating the user's row if needed, and refreshes keys on repost", async () => {
    expect((await POST(request("POST", subscription()))).status).toBe(204);
    expect((await POST(request("POST", subscription("auth-2")))).status).toBe(204);

    const rows = await admin`SELECT user_id, auth FROM push_subscriptions`;
    expect(rows).toEqual([{ user_id: USER_A, auth: "auth-2" }]);
  });

  it("lets another account on the same device subscribe too", async () => {
    claims = { sub: USER_B, email: "b@example.com" };
    expect((await POST(request("POST", subscription()))).status).toBe(204);
    const [{ count }] = await admin`SELECT count(*)::int AS count FROM push_subscriptions`;
    expect(count).toBe(2);
  });

  it("only deletes the caller's own subscription", async () => {
    // Still user B.
    expect((await DELETE(request("DELETE", { endpoint: ENDPOINT }))).status).toBe(204);
    const rows = await admin`SELECT user_id FROM push_subscriptions`;
    expect(rows).toEqual([{ user_id: USER_A }]);
    claims = { sub: USER_A, email: "a@example.com" };
  });
});
