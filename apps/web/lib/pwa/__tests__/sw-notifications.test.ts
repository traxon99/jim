import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const ORIGIN = "https://jim.test";
const TEMPLATE = readFileSync(new URL("../../../public/sw.template.js", import.meta.url), "utf8")
  .replaceAll("__BUILD_ID__", "test")
  .replace("__PRECACHE_URLS__", "[]")
  .replace("__PRECACHE_PAGES__", "[]");

interface FakeWindow {
  url: string;
  visibilityState: DocumentVisibilityState;
  focus: ReturnType<typeof vi.fn>;
  postMessage: ReturnType<typeof vi.fn>;
}

function fakeWindow(path: string, visibilityState: DocumentVisibilityState = "hidden") {
  const client: FakeWindow = {
    url: `${ORIGIN}${path}`,
    visibilityState,
    focus: vi.fn(async () => client),
    postMessage: vi.fn(),
  };
  return client;
}

/** Runs the real worker template's notification handlers against fake clients. */
function loadWorker(windows: FakeWindow[]) {
  const handlers = new Map<string, (event: unknown) => void>();
  const shown: { tag?: string; close: ReturnType<typeof vi.fn> }[] = [];
  const openWindow = vi.fn(async () => null);
  const context = {
    self: {
      location: { origin: ORIGIN },
      addEventListener: (type: string, handler: (event: unknown) => void) =>
        handlers.set(type, handler),
      clients: { matchAll: async () => windows, openWindow },
      registration: {
        showNotification: vi.fn(async (_title: string, options: { tag?: string }) => {
          shown.push({ tag: options.tag, close: vi.fn() });
        }),
        getNotifications: async ({ tag }: { tag: string }) =>
          shown.filter((notification) => notification.tag === tag),
        update: async () => {},
      },
    },
    URL,
  };
  runInNewContext(TEMPLATE, context);

  async function dispatch(type: string, event: Record<string, unknown>) {
    let pending: Promise<unknown> = Promise.resolve();
    handlers.get(type)?.({
      ...event,
      waitUntil: (promise: Promise<unknown>) => {
        pending = promise;
      },
    });
    await pending;
  }

  return {
    shown,
    openWindow,
    push: (message: Record<string, unknown>) =>
      dispatch("push", { data: { json: () => message, text: () => "" } }),
    click: (url: string) =>
      dispatch("notificationclick", { notification: { close: vi.fn(), data: { url } } }),
  };
}

describe("service worker notifications", () => {
  it("routes a running Jim to the workout a notification points at (#667)", async () => {
    const app = fakeWindow("/history");
    const worker = loadWorker([app]);
    await worker.click("/workout/abc");
    expect(app.focus).toHaveBeenCalled();
    expect(app.postMessage).toHaveBeenCalledWith({ type: "jim-navigate", path: "/workout/abc" });
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it("just focuses Jim for a notification with no page of its own", async () => {
    const app = fakeWindow("/history");
    await loadWorker([app]).click("/");
    expect(app.focus).toHaveBeenCalled();
    expect(app.postMessage).not.toHaveBeenCalled();
  });

  it("opens the page when Jim isn't running", async () => {
    const worker = loadWorker([]);
    await worker.click("/workout/abc");
    expect(worker.openWindow).toHaveBeenCalledWith(`${ORIGIN}/workout/abc`);
  });

  it("closes 'Rest complete' straight away while Jim is on screen (#682)", async () => {
    const worker = loadWorker([fakeWindow("/workout/abc", "visible")]);
    await worker.push({ title: "Rest complete", tag: "jim-rest-timer" });
    expect(worker.shown).toHaveLength(1);
    expect(worker.shown[0]?.close).toHaveBeenCalled();
  });

  it("leaves 'Rest complete' up when Jim is in the background", async () => {
    const worker = loadWorker([fakeWindow("/workout/abc", "hidden")]);
    await worker.push({ title: "Rest complete", tag: "jim-rest-timer" });
    expect(worker.shown[0]?.close).not.toHaveBeenCalled();
  });

  it("leaves other notifications up while Jim is on screen", async () => {
    const worker = loadWorker([fakeWindow("/workout/abc", "visible")]);
    await worker.push({ title: "Still working out?", tag: "jim-workout-idle" });
    expect(worker.shown[0]?.close).not.toHaveBeenCalled();
  });
});
