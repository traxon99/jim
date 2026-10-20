import { describe, expect, it } from "vitest";
import { syncIndicator } from "../indicator";

describe("syncIndicator", () => {
  it("shows being offline as neutral, with the live count of saved changes (#665)", () => {
    expect(syncIndicator({ kind: "offline", count: 1 }, 3, false)).toEqual({
      tone: "muted",
      text: "Offline · 3 saved on this phone",
    });
  });

  it("shows a set logged with no signal before the next sync cycle runs", () => {
    expect(syncIndicator({ kind: "synced" }, 1, false)).toEqual({
      tone: "muted",
      text: "Offline · 1 saved on this phone",
    });
  });

  it("stays quiet online while a fresh write waits for the next cycle", () => {
    expect(syncIndicator({ kind: "synced" }, 1, true)).toBeNull();
  });

  it("shows nothing offline when nothing is waiting", () => {
    expect(syncIndicator({ kind: "offline", count: 0 }, 0, false)).toBeNull();
  });

  it("keeps red for a server that refused, with a retry", () => {
    expect(syncIndicator({ kind: "error", count: 1 }, 2, true)).toEqual({
      tone: "alert",
      text: "Sync error · 2 pending",
      action: "retry",
    });
  });

  it("asks to sign in again when the session expired", () => {
    expect(syncIndicator({ kind: "signed-out", count: 0 }, 0, true)).toEqual({
      tone: "alert",
      text: "Signed out",
      action: "sign-in",
    });
  });

  it("follows the live count for pending changes", () => {
    expect(syncIndicator({ kind: "pending", count: 2 }, 1, true)).toEqual({
      tone: "muted",
      text: "Pending 1",
    });
    expect(syncIndicator({ kind: "pending", count: 2 }, 0, true)).toBeNull();
  });
});
