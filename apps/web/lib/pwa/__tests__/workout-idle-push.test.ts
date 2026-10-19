import { describe, expect, it } from "vitest";
import { isWorkoutIdleFirePayload, parseWorkoutIdleStart } from "../workout-idle-push";

const NOW = new Date("2026-10-19T12:00:00.000Z");
const ENDPOINT = "https://push.example/device-1";
const SESSION = "0192f3a0-0000-7000-8000-000000000001";

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

describe("parseWorkoutIdleStart", () => {
  const valid = {
    sessionId: SESSION,
    lastActivityAt: minutesAgo(2),
    autoEndMinutes: 60,
    endpoint: ENDPOINT,
  };

  it("accepts recent activity with auto-end on or off", () => {
    expect(parseWorkoutIdleStart(valid, NOW)).toEqual({
      ...valid,
      lastActivityAt: new Date(valid.lastActivityAt),
    });
    expect(parseWorkoutIdleStart({ ...valid, autoEndMinutes: null }, NOW)?.autoEndMinutes).toBe(
      null,
    );
  });

  it("rejects activity from the future or more than a day ago", () => {
    expect(parseWorkoutIdleStart({ ...valid, lastActivityAt: minutesAgo(-5) }, NOW)).toBeNull();
    expect(
      parseWorkoutIdleStart({ ...valid, lastActivityAt: minutesAgo(25 * 60) }, NOW),
    ).toBeNull();
  });

  it("rejects malformed bodies and out-of-range auto-end times", () => {
    expect(parseWorkoutIdleStart(null, NOW)).toBeNull();
    expect(parseWorkoutIdleStart({ ...valid, sessionId: "not-a-uuid" }, NOW)).toBeNull();
    expect(parseWorkoutIdleStart({ ...valid, endpoint: "" }, NOW)).toBeNull();
    expect(parseWorkoutIdleStart({ ...valid, autoEndMinutes: 5 }, NOW)).toBeNull();
    expect(parseWorkoutIdleStart({ ...valid, autoEndMinutes: undefined }, NOW)).toBeNull();
    expect(parseWorkoutIdleStart({ ...valid, lastActivityAt: "nope" }, NOW)).toBeNull();
  });
});

describe("isWorkoutIdleFirePayload", () => {
  it("requires a user, session, valid time and known stage", () => {
    const body = {
      userId: "u",
      sessionId: SESSION,
      lastActivityAt: minutesAgo(0),
      stage: "remind",
    };
    expect(isWorkoutIdleFirePayload(body)).toBe(true);
    expect(isWorkoutIdleFirePayload({ ...body, stage: "end" })).toBe(true);
    expect(isWorkoutIdleFirePayload({ ...body, stage: "later" })).toBe(false);
    expect(isWorkoutIdleFirePayload({ ...body, lastActivityAt: "nope" })).toBe(false);
    expect(isWorkoutIdleFirePayload({ ...body, userId: "" })).toBe(false);
  });
});
