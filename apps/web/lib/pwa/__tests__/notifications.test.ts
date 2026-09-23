import { shouldNotifyOfUpdate, updateNotificationBody } from "@/lib/pwa/notifications";
import { describe, expect, it } from "vitest";

describe("shouldNotifyOfUpdate", () => {
  it("fires when enabled, permitted, and there's a prior version to update from", () => {
    expect(
      shouldNotifyOfUpdate({ enabled: true, permission: "granted", hadController: true }),
    ).toBe(true);
  });

  it("stays quiet on the very first install — there's nothing to have updated from", () => {
    expect(
      shouldNotifyOfUpdate({ enabled: true, permission: "granted", hadController: false }),
    ).toBe(false);
  });

  it("stays quiet when the user hasn't opted in", () => {
    expect(
      shouldNotifyOfUpdate({ enabled: false, permission: "granted", hadController: true }),
    ).toBe(false);
  });

  it("stays quiet without browser permission", () => {
    expect(shouldNotifyOfUpdate({ enabled: true, permission: "denied", hadController: true })).toBe(
      false,
    );
    expect(
      shouldNotifyOfUpdate({ enabled: true, permission: "default", hadController: true }),
    ).toBe(false);
  });
});

describe("updateNotificationBody", () => {
  it("leads with the release note by default", () => {
    expect(updateNotificationBody()).toMatch(/^What's new: /);
  });

  it("wraps a given release note", () => {
    expect(updateNotificationBody("Faster sync.")).toBe("What's new: Faster sync.");
  });

  it("falls back to a generic message when there's no note", () => {
    expect(updateNotificationBody("")).toBe("A new version is ready — reload to update.");
  });
});
