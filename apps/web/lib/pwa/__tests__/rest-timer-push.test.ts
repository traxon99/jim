import { describe, expect, it } from "vitest";
import { MAX_REST_SECONDS, isRestTimerFirePayload, parseRestTimerStart } from "../rest-timer-push";

const NOW = new Date("2026-09-24T12:00:00.000Z");
const ENDPOINT = "https://push.example/device-1";

function at(offsetMs: number): string {
  return new Date(NOW.getTime() + offsetMs).toISOString();
}

describe("parseRestTimerStart", () => {
  it("accepts a rest ending in the near future", () => {
    expect(parseRestTimerStart({ endsAt: at(90_000), endpoint: ENDPOINT }, NOW)).toEqual({
      endsAt: new Date(at(90_000)),
      endpoint: ENDPOINT,
    });
  });

  it("tolerates a few seconds of clock skew into the past, but not more", () => {
    expect(parseRestTimerStart({ endsAt: at(-3_000), endpoint: ENDPOINT }, NOW)).not.toBeNull();
    expect(parseRestTimerStart({ endsAt: at(-60_000), endpoint: ENDPOINT }, NOW)).toBeNull();
  });

  it("rejects a rest longer than the cap", () => {
    const tooLong = at(MAX_REST_SECONDS * 1000 + 1_000);
    expect(parseRestTimerStart({ endsAt: tooLong, endpoint: ENDPOINT }, NOW)).toBeNull();
  });

  it("rejects malformed bodies", () => {
    expect(parseRestTimerStart(null, NOW)).toBeNull();
    expect(parseRestTimerStart({ endsAt: at(1_000) }, NOW)).toBeNull();
    expect(parseRestTimerStart({ endsAt: "not a date", endpoint: ENDPOINT }, NOW)).toBeNull();
    expect(parseRestTimerStart({ endsAt: 123, endpoint: ENDPOINT }, NOW)).toBeNull();
  });
});

describe("isRestTimerFirePayload", () => {
  it("requires a user id and a valid end time", () => {
    expect(isRestTimerFirePayload({ userId: "u", endsAt: at(0) })).toBe(true);
    expect(isRestTimerFirePayload({ userId: "u", endsAt: "nope" })).toBe(false);
    expect(isRestTimerFirePayload({ endsAt: at(0) })).toBe(false);
    expect(isRestTimerFirePayload("x")).toBe(false);
  });
});
