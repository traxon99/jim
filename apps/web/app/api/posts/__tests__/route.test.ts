import { resetTestDb } from "@/lib/test/test-db";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const AVATAR = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

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

const posts = await import("../route");
const profile = await import("../../profile/route");
const friendPosts = await import("../../friends/posts/route");
const friends = await import("../../friends/route");
const workouts = await import("../../friends/workouts/route");

function jsonRequest(method: string, body: unknown, path: string) {
  return new Request(`http://localhost${path}`, { method, body: JSON.stringify(body) });
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("/api/posts and /api/profile", () => {
  let admin: postgres.Sql;
  let sessionId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    admin = await resetTestDb();
    await admin`INSERT INTO auth.users (id, email) VALUES
      (${USER_A}, 'alice@example.com'), (${USER_B}, 'bob@example.com')`;
    await admin`INSERT INTO public.users (id, email) VALUES
      (${USER_A}, 'alice@example.com'), (${USER_B}, 'bob@example.com')`;
    await admin`INSERT INTO friendships (requester_id, addressee_id, status, accepted_at)
      VALUES (${USER_A}, ${USER_B}, 'accepted', now())`;
    const [session] = await admin<{ id: string }[]>`
      INSERT INTO sessions (user_id, name, device_id, started_at, ended_at)
      VALUES (${USER_B}, 'Leg Day', 'b', '2026-09-28T10:00:00Z', '2026-09-28T11:00:00Z')
      RETURNING id`;
    sessionId = session?.id ?? "";
  }, 30_000);

  afterAll(async () => {
    await admin.end();
  });

  it("returns the default profile", async () => {
    signInAs(USER_B, "bob@example.com");
    expect(await (await profile.GET()).json()).toEqual({
      username: "bob",
      avatar: null,
      shareWorkouts: true,
      shareWorkoutDetails: true,
    });
  });

  it("saves a picture and rejects anything that isn't a small image", async () => {
    signInAs(USER_B, "bob@example.com");
    const bad = await profile.PATCH(
      jsonRequest("PATCH", { avatar: "https://example.com/me.png" }, "/api/profile"),
    );
    expect(bad.status).toBe(400);
    const empty = await profile.PATCH(jsonRequest("PATCH", {}, "/api/profile"));
    expect(empty.status).toBe(400);

    const ok = await profile.PATCH(jsonRequest("PATCH", { avatar: AVATAR }, "/api/profile"));
    expect(await ok.json()).toMatchObject({ avatar: AVATAR });

    signInAs(USER_A, "alice@example.com");
    const listed = await (await friends.GET()).json();
    expect(listed.friends).toMatchObject([{ username: "bob", avatar: AVATAR }]);
  });

  it("posts a workout with a caption and shows it to friends", async () => {
    signInAs(USER_B, "bob@example.com");
    const invalid = await posts.POST(
      jsonRequest("POST", { kind: "workout", title: "Leg Day" }, "/api/posts"),
    );
    expect(invalid.status).toBe(400);

    const created = await posts.POST(
      jsonRequest(
        "POST",
        { kind: "workout", sessionId, title: "Leg Day", detail: "60 min", caption: " Ouch " },
        "/api/posts",
      ),
    );
    expect(created.status).toBe(200);
    const own = await (await posts.GET()).json();
    expect(own.posts).toEqual([
      expect.objectContaining({ kind: "workout", sessionId, title: "Leg Day", caption: "Ouch" }),
    ]);

    signInAs(USER_A, "alice@example.com");
    const feed = await (await friendPosts.GET()).json();
    expect(feed.posts).toEqual([
      expect.objectContaining({ username: "bob", avatar: AVATAR, caption: "Ouch", reactions: [] }),
    ]);
  });

  it("won't post someone else's workout", async () => {
    signInAs(USER_A, "alice@example.com");
    const response = await posts.POST(
      jsonRequest("POST", { kind: "workout", sessionId, title: "Leg Day" }, "/api/posts"),
    );
    expect(response.status).toBe(404);
  });

  it("follows the owner's sharing settings in the workout feed", async () => {
    signInAs(USER_B, "bob@example.com");
    await profile.PATCH(jsonRequest("PATCH", { shareWorkouts: false }, "/api/profile"));

    signInAs(USER_A, "alice@example.com");
    expect((await (await workouts.GET()).json()).workouts).toEqual([]);
    expect((await (await friendPosts.GET()).json()).posts).toHaveLength(1);
  });

  it("deletes only the author's own post", async () => {
    signInAs(USER_B, "bob@example.com");
    const [post] = (await (await posts.GET()).json()).posts;

    signInAs(USER_A, "alice@example.com");
    const notMine = await posts.DELETE(
      jsonRequest("DELETE", { postId: post.postId }, "/api/posts"),
    );
    expect(notMine.status).toBe(404);

    signInAs(USER_B, "bob@example.com");
    const deleted = await posts.DELETE(
      jsonRequest("DELETE", { postId: post.postId }, "/api/posts"),
    );
    expect(await deleted.json()).toEqual({ ok: true });
    expect((await (await posts.GET()).json()).posts).toEqual([]);
  });
});
