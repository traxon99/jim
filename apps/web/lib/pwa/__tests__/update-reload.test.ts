import { describe, expect, it, vi } from "vitest";
import {
  UPDATE_CHECK_INTERVAL_MS,
  checkForUpdateOnReturn,
  navigateMessagePath,
  reloadOnUpdateWhenAway,
} from "../update-reload";

function setup(visibilityState: DocumentVisibilityState = "visible") {
  const container = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState });
  const reload = vi.fn();
  const cleanup = reloadOnUpdateWhenAway(container, doc, reload);
  return { container, doc, reload, cleanup };
}

describe("reloadOnUpdateWhenAway", () => {
  it("waits until the user leaves the app before reloading (#507)", () => {
    const { container, doc, reload } = setup();
    container.dispatchEvent(new Event("controllerchange"));
    expect(reload).not.toHaveBeenCalled();

    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(reload).toHaveBeenCalledTimes(1);

    doc.dispatchEvent(new Event("visibilitychange"));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads straight away when the update lands in the background", () => {
    const { container, reload } = setup("hidden");
    container.dispatchEvent(new Event("controllerchange"));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("doesn't reload on a visibility change without an update", () => {
    const { doc, reload } = setup();
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(reload).not.toHaveBeenCalled();
  });

  it("removes its listeners on cleanup", () => {
    const { container, doc, reload, cleanup } = setup();
    cleanup();
    container.dispatchEvent(new Event("controllerchange"));
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("checkForUpdateOnReturn (#671)", () => {
  function returnSetup() {
    let clock = 0;
    const doc = Object.assign(new EventTarget(), {
      visibilityState: "hidden" as DocumentVisibilityState,
    });
    const update = vi.fn(async () => undefined);
    checkForUpdateOnReturn({ update } as never, doc, () => clock);
    const returnAfter = (ms: number) => {
      clock += ms;
      doc.visibilityState = "visible";
      doc.dispatchEvent(new Event("visibilitychange"));
      doc.visibilityState = "hidden";
      doc.dispatchEvent(new Event("visibilitychange"));
    };
    return { update, returnAfter };
  }

  it("checks for an update when the app returns after a while", () => {
    const { update, returnAfter } = returnSetup();
    returnAfter(UPDATE_CHECK_INTERVAL_MS);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("checks at most once per interval", () => {
    const { update, returnAfter } = returnSetup();
    returnAfter(60_000);
    expect(update).not.toHaveBeenCalled();
    returnAfter(UPDATE_CHECK_INTERVAL_MS);
    returnAfter(60_000);
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe("navigateMessagePath (#667)", () => {
  it("returns the path a notification tap points at", () => {
    expect(navigateMessagePath({ type: "jim-navigate", path: "/workout/abc" })).toBe(
      "/workout/abc",
    );
  });

  it.each([
    null,
    "jim-navigate",
    { type: "other", path: "/workout" },
    { type: "jim-navigate", path: "https://evil.test/" },
    { type: "jim-navigate", path: "//evil.test/" },
  ])("ignores %j", (data) => {
    expect(navigateMessagePath(data)).toBeNull();
  });
});
