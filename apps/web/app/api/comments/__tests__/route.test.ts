import { resetTestDb } from "@/lib/test/test-db";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const OWNER = "11111111-1111-1111-1111-111111111111";
const FRIEND = "22222222-2222-2222-2222-222222222222";

const claims = { sub: FRIEND, email: "friend@example.com" };
function signInAs(userId: string, email: string) {
  claims.sub = userId;
  claims.email = email;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims } }) },
  }),
}));

const comments = await import("../route");
const reactions = await import("../reactions/route");
const workouts = await import("../../friends/workouts/route");

function jsonRequest(method: string, body: unknown) {
  return new Request("http://localhost/api/comments", { method, body: JSON.stringify(body) });
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("/api/comments", () => {
  let admin: postgres.Sql;
  let sessionId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    admin = await resetTestDb();
    await admin`INSERT INTO auth.users (id, email) VALUES
      (${OWNER}, 'owner@example.com'), (${FRIEND}, 'friend@example.com')`;
    await admin`INSERT INTO public.users (id, email) VALUES
      (${OWNER}, 'owner@example.com'), (${FRIEND}, 'friend@example.com')`;
    await admin`INSERT INTO friendships (requester_id, addressee_id, status, accepted_at)
      VALUES (${OWNER}, ${FRIEND}, 'accepted', now())`;
    const [session] = await admin<{ id: string }[]>`
      INSERT INTO sessions (user_id, name, device_id, started_at, ended_at)
      VALUES (${OWNER}, 'Leg Day', 'o', now() - interval '1 hour', now()) RETURNING id`;
    sessionId = session?.id ?? "";
  }, 30_000);

  afterAll(async () => {
    await admin.end();
  });

  it("rejects a malformed thread or comment", async () => {
    signInAs(FRIEND, "friend@example.com");
    expect((await comments.GET(new Request("http://localhost/api/comments"))).status).toBe(400);
    expect((await comments.POST(jsonRequest("POST", { sessionId, body: "  " }))).status).toBe(400);
    expect(
      (await comments.POST(jsonRequest("POST", { sessionId, postId: sessionId, body: "x" })))
        .status,
    ).toBe(400);
  });

  it("posts, lists, reacts to and deletes a comment, with the count on the feed", async () => {
    signInAs(FRIEND, "friend@example.com");
    const posted = await (
      await comments.POST(jsonRequest("POST", { sessionId, body: " deep! " }))
    ).json();
    expect(posted.commentId).toBeTruthy();

    const feed = await (await workouts.GET(new Request("http://test/api/friends/workouts"))).json();
    expect(feed.workouts[0].comments).toEqual({
      count: 1,
      latest: { username: "friend", body: "deep!" },
    });

    signInAs(OWNER, "owner@example.com");
    const listed = await (
      await comments.GET(new Request(`http://localhost/api/comments?sessionId=${sessionId}`))
    ).json();
    expect(listed.comments).toMatchObject([
      { username: "friend", body: "deep!", mine: false, canDelete: true, reactions: [] },
    ]);

    const reacted = await reactions.POST(
      new Request("http://localhost/api/comments/reactions", {
        method: "POST",
        body: JSON.stringify({ commentId: posted.commentId, kind: "fire" }),
      }),
    );
    expect(await reacted.json()).toEqual({ reacted: true });

    const deleted = await comments.DELETE(jsonRequest("DELETE", { commentId: posted.commentId }));
    expect(await deleted.json()).toEqual({ ok: true });
    const again = await comments.DELETE(jsonRequest("DELETE", { commentId: posted.commentId }));
    expect(again.status).toBe(404);
  });
});
