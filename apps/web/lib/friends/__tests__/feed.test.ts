import { describe, expect, it } from "vitest";
import { buildFeed } from "../feed";
import type { FriendPost, FriendWorkout } from "../types";

function workout(sessionId: string, endedAt: string): FriendWorkout {
  return {
    sessionId,
    userId: "u1",
    username: "bob",
    avatar: null,
    units: "lb",
    name: "Push Day",
    startedAt: endedAt,
    endedAt,
    exercises: [],
    reactions: [],
  };
}

function post(postId: string, createdAt: string, sessionId: string | null = null): FriendPost {
  return {
    postId,
    userId: "u1",
    username: "bob",
    avatar: null,
    kind: sessionId ? "workout" : "record",
    sessionId,
    title: "Bench Press",
    detail: null,
    caption: `caption ${postId}`,
    createdAt,
    reactions: [],
  };
}

describe("buildFeed", () => {
  it("interleaves workouts and posts newest first", () => {
    const feed = buildFeed(
      [workout("s1", "2026-10-01T10:00:00Z"), workout("s2", "2026-09-29T10:00:00Z")],
      [post("p1", "2026-09-30T10:00:00Z")],
    );
    expect(feed.map((item) => item.at)).toEqual([
      "2026-10-01T10:00:00Z",
      "2026-09-30T10:00:00Z",
      "2026-09-29T10:00:00Z",
    ]);
  });

  it("folds a post into the workout it shares instead of a second card", () => {
    const feed = buildFeed(
      [workout("s1", "2026-10-01T10:00:00Z")],
      [post("p2", "2026-10-01T10:05:00Z", "s1"), post("p1", "2026-10-01T10:01:00Z", "s1")],
    );
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ type: "workout", post: { postId: "p2" } });
  });

  it("shows a workout post on its own when the workout isn't in the feed", () => {
    const feed = buildFeed([], [post("p1", "2026-10-01T10:00:00Z", "s9")]);
    expect(feed).toEqual([expect.objectContaining({ type: "post" })]);
  });
});
