import {
  detectPushSupport,
  releasePushMessage,
  restCompleteMessage,
  shouldSendReleasePush,
  updateNotificationBody,
  urlBase64ToUint8Array,
} from "@/lib/pwa/notifications";
import { describe, expect, it } from "vitest";

describe("updateNotificationBody", () => {
  it("leads with the release note by default", () => {
    expect(updateNotificationBody()).toMatch(/^What's new: /);
  });

  it("wraps a given release note", () => {
    expect(updateNotificationBody("Faster sync.")).toBe("What's new: Faster sync.");
  });

  it("falls back to a generic message when there's no note", () => {
    expect(updateNotificationBody("")).toBe("A new version is ready. Open Jim to update.");
  });
});

describe("releasePushMessage", () => {
  it("carries everything the service worker needs to show and open the notification", () => {
    expect(releasePushMessage("Faster sync.")).toEqual({
      title: "Jim updated",
      body: "What's new: Faster sync.",
      url: "/",
      tag: "jim-release",
    });
  });
});

describe("shouldSendReleasePush (#668)", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

  it("sends the first note ever", () => {
    expect(shouldSendReleasePush("Faster sync.", undefined, now)).toBe(true);
  });

  it("never sends the same note twice, however long ago", () => {
    expect(shouldSendReleasePush("A", { note: "A", sentAt: hoursAgo(72) }, now)).toBe(false);
  });

  it("holds a new note until a day after the last push", () => {
    expect(shouldSendReleasePush("B", { note: "A", sentAt: hoursAgo(23) }, now)).toBe(false);
    expect(shouldSendReleasePush("B", { note: "A", sentAt: hoursAgo(24) }, now)).toBe(true);
  });

  it("sends nothing for an empty note", () => {
    expect(shouldSendReleasePush("", undefined, now)).toBe(false);
  });
});

describe("restCompleteMessage", () => {
  it("carries a distinct tag so it doesn't collide with the release notification", () => {
    expect(restCompleteMessage()).toEqual({
      title: "Rest complete",
      body: "Time for your next set.",
      url: "/",
      tag: "jim-rest-timer",
    });
  });
});

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const full = { hasServiceWorker: true, hasPushManager: true, hasNotification: true };
const noPush = { hasServiceWorker: true, hasPushManager: false, hasNotification: false };

describe("detectPushSupport", () => {
  it("is supported when all three APIs exist", () => {
    expect(
      detectPushSupport({ ...full, userAgent: IPHONE_UA, maxTouchPoints: 5, standalone: true }),
    ).toBe("supported");
  });

  it("asks for a Home Screen install in an iPhone Safari tab", () => {
    expect(
      detectPushSupport({ ...noPush, userAgent: IPHONE_UA, maxTouchPoints: 5, standalone: false }),
    ).toBe("needs-install");
  });

  it("treats a touch-capable 'Macintosh' (iPadOS) as iOS", () => {
    expect(
      detectPushSupport({ ...noPush, userAgent: MAC_UA, maxTouchPoints: 5, standalone: false }),
    ).toBe("needs-install");
  });

  it("is unsupported on a desktop browser without push, and on an installed iOS app without it", () => {
    expect(
      detectPushSupport({ ...noPush, userAgent: MAC_UA, maxTouchPoints: 0, standalone: false }),
    ).toBe("unsupported");
    expect(
      detectPushSupport({ ...noPush, userAgent: IPHONE_UA, maxTouchPoints: 5, standalone: true }),
    ).toBe("unsupported");
  });
});

describe("urlBase64ToUint8Array", () => {
  it("decodes unpadded base64url, including the url-safe characters", () => {
    // "-_-_" is base64url for 0xfb 0xff 0xbf ("+/+/" in plain base64).
    expect(Array.from(urlBase64ToUint8Array("-_-_"))).toEqual([0xfb, 0xff, 0xbf]);
    expect(Array.from(urlBase64ToUint8Array("AQI"))).toEqual([1, 2]);
  });
});
