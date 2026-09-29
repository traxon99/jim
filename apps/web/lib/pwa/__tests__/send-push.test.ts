import { releasePushMessage } from "@/lib/pwa/notifications";
import {
  type StoredSubscription,
  fanOutPush,
  isExpiredSubscriptionError,
} from "@/lib/pwa/send-push";
import { describe, expect, it } from "vitest";

function sub(name: string): StoredSubscription {
  return { endpoint: `https://push.example/${name}`, p256dh: "p", auth: "a" };
}

function httpError(statusCode: number) {
  return Object.assign(new Error(`HTTP ${statusCode}`), { statusCode });
}

describe("isExpiredSubscriptionError", () => {
  it("treats 404 and 410 as gone for good", () => {
    expect(isExpiredSubscriptionError(httpError(404))).toBe(true);
    expect(isExpiredSubscriptionError(httpError(410))).toBe(true);
  });

  it("keeps the row for anything that might be transient", () => {
    expect(isExpiredSubscriptionError(httpError(429))).toBe(false);
    expect(isExpiredSubscriptionError(httpError(500))).toBe(false);
    expect(isExpiredSubscriptionError(new Error("ECONNRESET"))).toBe(false);
    expect(isExpiredSubscriptionError(null)).toBe(false);
  });
});

describe("fanOutPush", () => {
  it("sends once per endpoint when two accounts share a browser", async () => {
    const sent: string[] = [];
    const result = await fanOutPush(
      [sub("shared"), sub("other"), sub("shared")],
      releasePushMessage("Faster sync."),
      async (subscription) => {
        sent.push(subscription.endpoint);
      },
    );
    expect(sent).toEqual(["https://push.example/shared", "https://push.example/other"]);
    expect(result.sent).toBe(2);
  });

  it("sends the message as JSON to every subscription and tallies the outcomes", async () => {
    const payloads: string[] = [];
    const result = await fanOutPush(
      [sub("ok"), sub("gone"), sub("flaky"), sub("expired")],
      releasePushMessage("Faster sync."),
      async (subscription, payload) => {
        payloads.push(payload);
        if (subscription.endpoint.endsWith("gone")) throw httpError(410);
        if (subscription.endpoint.endsWith("expired")) throw httpError(404);
        if (subscription.endpoint.endsWith("flaky")) throw httpError(503);
      },
    );

    expect(result).toEqual({
      sent: 1,
      failed: 1,
      expired: ["https://push.example/gone", "https://push.example/expired"],
    });
    expect(JSON.parse(payloads[0])).toEqual({
      title: "Jim updated",
      body: "What's new: Faster sync.",
      url: "/",
      tag: "jim-release",
    });
  });

  it("does nothing with no subscribers", async () => {
    expect(await fanOutPush([], releasePushMessage(), async () => {})).toEqual({
      sent: 0,
      failed: 0,
      expired: [],
    });
  });
});
