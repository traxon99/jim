import { resetTestDb } from "@/lib/test/test-db";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const USER_C = "33333333-3333-3333-3333-333333333333";

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

const suggestions = await import("../route");

describe.skipIf(!process.env.TEST_DATABASE_URL)("/api/friends/suggestions", () => {
  let admin: postgres.Sql;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    admin = await resetTestDb();
    await admin`INSERT INTO auth.users (id, email) VALUES
      (${USER_A}, 'alice@example.com'), (${USER_B}, 'bob@example.com'),
      (${USER_C}, 'carol@example.com')`;
    await admin`INSERT INTO friendships (requester_id, addressee_id, status, accepted_at) VALUES
      (${USER_A}, ${USER_B}, 'accepted', now()),
      (${USER_B}, ${USER_C}, 'accepted', now())`;
  }, 30_000);

  afterAll(async () => {
    await admin.end();
  });

  it("returns friends of friends and remembers dismissals", async () => {
    signInAs(USER_A, "alice@example.com");
    const listed = await (await suggestions.GET()).json();
    expect(listed.suggestions).toMatchObject([{ userId: USER_C, mutualCount: 1 }]);

    const dismissed = await suggestions.DELETE(
      new Request("http://localhost/api/friends/suggestions", {
        method: "DELETE",
        body: JSON.stringify({ userId: USER_C }),
      }),
    );
    expect(dismissed.status).toBe(200);

    const after = await (await suggestions.GET()).json();
    expect(after.suggestions).toHaveLength(0);
  });
});
