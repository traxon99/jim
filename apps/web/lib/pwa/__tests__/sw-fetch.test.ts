import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const TEMPLATE = readFileSync(new URL("../../../public/sw.template.js", import.meta.url), "utf8")
  .replaceAll("__BUILD_ID__", "test")
  .replace("__PRECACHE_URLS__", "[]");

const ORIGIN = "https://jim.test";

/** Runs the real service worker template and returns its fetch handler. */
function loadFetchHandler() {
  const handlers = new Map<string, (event: unknown) => void>();
  const cached = new Response("cached");
  const context = {
    self: {
      location: { origin: ORIGIN },
      addEventListener: (type: string, handler: (event: unknown) => void) =>
        handlers.set(type, handler),
    },
    caches: {
      match: vi.fn(async () => cached),
      open: vi.fn(async () => ({ put: vi.fn() })),
    },
    fetch: vi.fn(async () => new Response("network")),
    URL,
  };
  runInNewContext(TEMPLATE, context);
  const handler = handlers.get("fetch");
  if (!handler) throw new Error("sw.template.js registered no fetch handler");
  return handler;
}

/** Dispatches a GET and reports whether the worker took over the response. */
function intercepts(path: string, mode: RequestMode = "cors"): boolean {
  const respondWith = vi.fn();
  loadFetchHandler()({
    request: { method: "GET", url: `${ORIGIN}${path}`, mode },
    respondWith,
  });
  return respondWith.mock.calls.length > 0;
}

describe("service worker fetch handler", () => {
  it.each(["/api/sync/pull?since=0", "/api/settings", "/?_rsc=abc123", "/history?_rsc=abc123"])(
    "leaves per-user request %s to the network",
    (path) => {
      expect(intercepts(path)).toBe(false);
    },
  );

  it.each([
    "/_next/static/chunks/app.js",
    "/_next/static/media/roboto.woff2",
    "/icons/192",
    "/splash/iphone-16",
    "/manifest.webmanifest",
  ])("serves static asset %s cache-first", (path) => {
    expect(intercepts(path)).toBe(true);
  });

  it("still handles navigations (offline shell fallback)", () => {
    expect(intercepts("/", "navigate")).toBe(true);
  });
});
