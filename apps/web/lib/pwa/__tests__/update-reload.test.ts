import { describe, expect, it, vi } from "vitest";
import { reloadOnUpdateWhenAway } from "../update-reload";

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
