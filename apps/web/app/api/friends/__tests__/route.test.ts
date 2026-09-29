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

const friends = await import("../route");
const workouts = await import("../workouts/route");
const username = await import("../../username/route");
const reactions = await import("../reactions/route");

function jsonRequest(method: string, body: unknown, path = "/api/friends") {
  return new Request(`http://localhost${path}`, { method, body: JSON.stringify(body) });
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("/api/friends", () => {
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

  it("creates the user's row with an email-derived username", async () => {
    signInAs(USER_B, "bob@example.com");
    const response = await friends.GET();
    expect(await response.json()).toEqual({ username: "bob", friends: [] });
  });

  it("lets a user pick a new username, but not a taken one", async () => {
    signInAs(USER_A, "alice@example.com");
    const taken = await username.PUT(jsonRequest("PUT", { username: "Bob" }, "/api/username"));
    expect(taken.status).toBe(409);

    const invalid = await username.PUT(jsonRequest("PUT", { username: "a b" }, "/api/username"));
    expect(invalid.status).toBe(400);

    const ok = await username.PUT(jsonRequest("PUT", { username: "@Ally" }, "/api/username"));
    expect(await ok.json()).toEqual({ username: "ally" });
  });

  it("sends, accepts and lists a friendship, then shows the friend's workouts", async () => {
    signInAs(USER_A, "alice@example.com");
    const sent = await friends.POST(jsonRequest("POST", { username: "BOB" }));
    expect(await sent.json()).toEqual({ result: "sent" });

    signInAs(USER_B, "bob@example.com");
    const listed = await (await friends.GET()).json();
    expect(listed.friends).toMatchObject([
      { userId: USER_A, username: "ally", status: "pending", direction: "incoming" },
    ]);

    const accepted = await friends.PATCH(jsonRequest("PATCH", { userId: USER_A, accept: true }));
    expect(accepted.status).toBe(200);

    await admin`INSERT INTO sessions (user_id, name, device_id, started_at, ended_at)
      VALUES (${USER_B}, 'Leg Day', 'b', '2026-09-28T10:00:00Z', '2026-09-28T11:00:00Z')`;

    signInAs(USER_A, "alice@example.com");
    const feed = await (await workouts.GET()).json();
    expect(feed.workouts).toEqual([
      expect.objectContaining({
        userId: USER_B,
        username: "bob",
        name: "Leg Day",
        startedAt: "2026-09-28T10:00:00.000Z",
        exercises: [],
        reactions: [],
      }),
    ]);
  });

  it("reacts to a friend's workout and shows it to its owner", async () => {
    signInAs(USER_A, "alice@example.com");
    const [workout] = (await (await workouts.GET()).json()).workouts;
    const path = "/api/friends/reactions";

    const bad = await reactions.POST(
      jsonRequest("POST", { sessionId: workout.sessionId, kind: "nope" }, path),
    );
    expect(bad.status).toBe(400);

    const added = await reactions.POST(
      jsonRequest("POST", { sessionId: workout.sessionId, kind: "fire" }, path),
    );
    expect(await added.json()).toEqual({ reacted: true });
    const feed = await (await workouts.GET()).json();
    expect(feed.workouts[0].reactions).toEqual([{ kind: "fire", count: 1, mine: true }]);

    signInAs(USER_B, "bob@example.com");
    const own = await reactions.POST(
      jsonRequest("POST", { sessionId: workout.sessionId, kind: "fire" }, path),
    );
    expect(own.status).toBe(404);
    const received = await (await reactions.GET()).json();
    expect(received.reactions).toEqual([
      expect.objectContaining({ username: "ally", kind: "fire", sessionName: "Leg Day" }),
    ]);

    signInAs(USER_A, "alice@example.com");
    const removed = await reactions.POST(
      jsonRequest("POST", { sessionId: workout.sessionId, kind: "fire" }, path),
    );
    expect(await removed.json()).toEqual({ reacted: false });
  });

  it("404s answering a request that doesn't exist", async () => {
    signInAs(USER_A, "alice@example.com");
    const response = await friends.PATCH(jsonRequest("PATCH", { userId: USER_B, accept: true }));
    expect(response.status).toBe(404);
  });

  it("rejects a malformed user id", async () => {
    const response = await friends.DELETE(jsonRequest("DELETE", { userId: "nope" }));
    expect(response.status).toBe(400);
  });

  it("unfriends", async () => {
    signInAs(USER_A, "alice@example.com");
    const response = await friends.DELETE(jsonRequest("DELETE", { userId: USER_B }));
    expect(await response.json()).toEqual({ ok: true });
    const feed = await (await workouts.GET()).json();
    expect(feed.workouts).toEqual([]);
  });
});
