import { resetTestDb } from "@/lib/test/test-db";
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

const activity = await import("../route");
const friends = await import("../../friends/route");

function jsonRequest(method: string, body?: unknown) {
  return new Request("http://localhost/api/activity", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("/api/activity", () => {
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

  it("lists a friend request and clears unread when marked seen", async () => {
    signInAs(USER_A, "alice@example.com");
    await friends.GET();
    signInAs(USER_B, "bob@example.com");
    await friends.GET();

    signInAs(USER_B, "bob@example.com");
    await friends.POST(
      new Request("http://localhost/api/friends", {
        method: "POST",
        body: JSON.stringify({ username: "alice" }),
      }),
    );

    signInAs(USER_A, "alice@example.com");
    const listed = await (await activity.GET()).json();
    expect(listed.unread).toBe(true);
    expect(listed.items.some((item: { kind: string }) => item.kind === "friend_request")).toBe(
      true,
    );

    const seen = await activity.POST(jsonRequest("POST", { action: "mark_seen" }));
    expect(seen.status).toBe(200);
    const after = await (await activity.GET()).json();
    expect(after.unread).toBe(false);
  });
});
