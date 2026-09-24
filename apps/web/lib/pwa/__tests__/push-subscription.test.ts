import { isEndpointPayload, isPushSubscriptionPayload } from "@/lib/pwa/push-subscription";
import { describe, expect, it } from "vitest";

const valid = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  expirationTime: null,
  keys: { p256dh: "BNc", auth: "tBH" },
};

describe("isPushSubscriptionPayload", () => {
  it("accepts a PushSubscription.toJSON() shape", () => {
    expect(isPushSubscriptionPayload(valid)).toBe(true);
  });

  it("rejects non-https or malformed endpoints", () => {
    expect(isPushSubscriptionPayload({ ...valid, endpoint: "http://push.example/x" })).toBe(false);
    expect(isPushSubscriptionPayload({ ...valid, endpoint: "not a url" })).toBe(false);
    expect(isPushSubscriptionPayload({ ...valid, endpoint: "" })).toBe(false);
  });

  it("rejects missing or empty keys", () => {
    expect(isPushSubscriptionPayload({ endpoint: valid.endpoint })).toBe(false);
    expect(isPushSubscriptionPayload({ ...valid, keys: null })).toBe(false);
    expect(isPushSubscriptionPayload({ ...valid, keys: { p256dh: "BNc" } })).toBe(false);
    expect(isPushSubscriptionPayload({ ...valid, keys: { p256dh: "", auth: "x" } })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isPushSubscriptionPayload(null)).toBe(false);
    expect(isPushSubscriptionPayload("https://push.example")).toBe(false);
  });
});

describe("isEndpointPayload", () => {
  it("needs a non-empty endpoint string", () => {
    expect(isEndpointPayload({ endpoint: valid.endpoint })).toBe(true);
    expect(isEndpointPayload({ endpoint: "" })).toBe(false);
    expect(isEndpointPayload({})).toBe(false);
    expect(isEndpointPayload(null)).toBe(false);
  });
});
