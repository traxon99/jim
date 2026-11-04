import { describe, expect, it } from "vitest";
import { postShareText } from "../share-post";
import type { FriendPost, FriendWorkout } from "../types";

describe("postShareText", () => {
  it("summarizes a workout feed item", () => {
    const workout: FriendWorkout = {
      sessionId: "s1",
      userId: "u",
      username: "maya",
      avatar: null,
      units: "lb",
      name: "Push Day",
      startedAt: "2026-11-04T10:00:00Z",
      endedAt: "2026-11-04T11:00:00Z",
      routineColor: null,
      gymName: null,
      volume: 5000,
      muscles: [],
      records: [],
      exercises: [{ name: "Bench Press", sets: 3, topWeight: 185, topReps: 5 }],
      reactions: [],
      reactedBy: [],
      comments: { count: 0, latest: null },
    };
    const { title, text } = postShareText({
      type: "workout",
      workout,
      post: null,
      at: workout.endedAt,
    });
    expect(title).toBe("Push Day");
    expect(text).toContain("@maya");
    expect(text).toContain("Bench Press");
  });

  it("summarizes a record post", () => {
    const post: FriendPost = {
      postId: "p1",
      userId: "u",
      username: "maya",
      avatar: null,
      kind: "record",
      sessionId: null,
      title: "Bench Press",
      detail: "225 lb",
      caption: "Finally",
      createdAt: "2026-11-04T12:00:00Z",
      reactions: [],
      reactedBy: [],
      comments: { count: 0, latest: null },
    };
    const { text } = postShareText({ type: "post", post, at: post.createdAt });
    expect(text).toContain("New personal record");
    expect(text).toContain("Finally");
  });
});
