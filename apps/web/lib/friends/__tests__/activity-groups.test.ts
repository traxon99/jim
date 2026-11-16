import { REACTION_KINDS } from "@jim/core";
import { describe, expect, it } from "vitest";
import { dayLabel, groupActivity, peopleLine, reactionTally } from "../activity-groups";
import type { ActivityItem } from "../types";

function item(overrides: Partial<ActivityItem>): ActivityItem {
  return {
    id: Math.random().toString(36),
    kind: "workout_reaction",
    occurredAt: "2026-11-16T12:00:00.000Z",
    actorUserId: "u1",
    actorUsername: "maya",
    actorAvatar: null,
    sessionId: "s1",
    sessionName: "Push Day",
    postId: null,
    commentId: null,
    reactionKind: "heart",
    commentBody: null,
    sessionStartedAt: "2026-11-16T10:00:00.000Z",
    sessionEndedAt: "2026-11-16T10:50:00.000Z",
    routineIcon: { shape: "square", color: "orange" },
    postKind: null,
    postTitle: null,
    postDetail: null,
    isNew: false,
    ...overrides,
  };
}

describe("groupActivity", () => {
  it("puts a workout's reactions and comments in one group with its duration", () => {
    const { fresh, earlier, requests } = groupActivity([
      item({ actorUsername: "maya", reactionKind: "heart" }),
      item({ actorUsername: "theo", reactionKind: "fire", isNew: true }),
      item({
        kind: "comment",
        actorUsername: "theo",
        reactionKind: null,
        commentId: "c1",
        commentBody: "bar speed",
        occurredAt: "2026-11-16T13:00:00.000Z",
      }),
    ]);
    expect(requests).toEqual([]);
    expect(earlier).toEqual([]);
    expect(fresh).toHaveLength(1);
    const [group] = fresh;
    expect(group).toMatchObject({
      key: "session:s1",
      target: { sessionId: "s1" },
      title: "Push Day",
      durationMinutes: 50,
      isNew: true,
    });
    expect(group?.reactions.map((r) => r.actorUsername)).toEqual(["maya", "theo"]);
    expect(group?.comments.map((c) => c.commentBody)).toEqual(["bar speed"]);
  });

  it("keeps a record post apart from the workout it came from", () => {
    const { earlier } = groupActivity([
      item({ sessionId: "s1" }),
      item({
        kind: "post_reaction",
        postId: "p1",
        postKind: "record",
        postTitle: "Bench Press",
        postDetail: "New e1RM · 245 lb",
        sessionId: "s1",
        reactionKind: "party",
      }),
    ]);
    expect(earlier.map((g) => g.key).sort()).toEqual(["post:p1", "session:s1"]);
    const post = earlier.find((g) => g.key === "post:p1");
    expect(post).toMatchObject({
      kind: "record",
      title: "Bench Press",
      target: { postId: "p1" },
      routineIcon: null,
      durationMinutes: null,
    });
  });

  it("lists friend requests on their own", () => {
    const request = item({ kind: "friend_request", sessionId: null, reactionKind: null });
    expect(groupActivity([request]).requests).toEqual([request]);
  });
});

describe("reactionTally", () => {
  it("counts each emoji, most used first", () => {
    const tally = reactionTally(
      [
        item({ reactionKind: "fire" }),
        item({ reactionKind: "heart" }),
        item({ reactionKind: "fire" }),
        item({ reactionKind: "strong" }),
      ],
      REACTION_KINDS,
    );
    expect(tally).toEqual([
      { kind: "fire", count: 2 },
      { kind: "heart", count: 1 },
      { kind: "strong", count: 1 },
    ]);
  });
});

describe("peopleLine", () => {
  it("names up to three people, then two and a count", () => {
    expect(peopleLine(["a", "b", "c"])).toEqual({ names: ["a", "b", "c"], more: 0 });
    expect(peopleLine(["a", "b", "a", "c", "d"])).toEqual({ names: ["a", "b"], more: 2 });
  });
});

describe("dayLabel", () => {
  const now = new Date(2026, 10, 16, 15, 0);
  it("says Today, Yesterday, a weekday, then a date", () => {
    expect(dayLabel(new Date(2026, 10, 16, 8).toISOString(), now)).toBe("Today");
    expect(dayLabel(new Date(2026, 10, 15, 8).toISOString(), now)).toBe("Yesterday");
    expect(dayLabel(new Date(2026, 10, 13, 8).toISOString(), now)).toMatch(/Fri/);
    expect(dayLabel(new Date(2026, 9, 1, 8).toISOString(), now)).toMatch(/Oct/);
  });
});
