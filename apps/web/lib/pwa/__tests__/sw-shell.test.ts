import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const ORIGIN = "https://jim.test";
const TEMPLATE = readFileSync(new URL("../../../public/sw.template.js", import.meta.url), "utf8")
  .replaceAll("__BUILD_ID__", "test")
  .replace("__PRECACHE_URLS__", JSON.stringify(["/", "/login"]));

function redirected(body: string): Response {
  const response = new Response(body);
  Object.defineProperty(response, "redirected", { value: true });
  return response;
}

/** Runs the real worker template against an in-memory cache and a stubbed network (#506). */
function loadWorker(network: (url: string) => Promise<Response>) {
  const handlers = new Map<string, (event: unknown) => void>();
  const store = new Map<string, Response>();
  const cache = {
    put: vi.fn(async (url: string, response: Response) => {
      store.set(url, response);
    }),
  };
  const context = {
    self: {
      location: { origin: ORIGIN },
      addEventListener: (type: string, handler: (event: unknown) => void) =>
        handlers.set(type, handler),
      skipWaiting: async () => {},
    },
    caches: {
      open: async () => cache,
      match: async (key: string | { url: string }) => {
        const path = typeof key === "string" ? key : new URL(key.url).pathname;
        return store.get(path)?.clone();
      },
    },
    fetch: vi.fn(async (input: string | { url: string }) =>
      network(typeof input === "string" ? input : new URL(input.url).pathname),
    ),
    URL,
    Error,
  };
  runInNewContext(TEMPLATE, context);

  async function dispatch(type: string, event: Record<string, unknown>) {
    let pending: Promise<unknown> = Promise.resolve();
    handlers.get(type)?.({
      ...event,
      waitUntil: (promise: Promise<unknown>) => {
        pending = promise;
      },
      respondWith: (promise: Promise<unknown>) => {
        pending = promise;
      },
    });
    return pending;
  }

  return {
    store,
    install: () => dispatch("install", {}),
    navigate: (path: string) =>
      dispatch("fetch", {
        request: { method: "GET", url: `${ORIGIN}${path}`, mode: "navigate" },
      }) as Promise<Response | undefined>,
  };
}

describe("service worker offline shell", () => {
  it("doesn't precache a page that redirected, and falls back to /login offline", async () => {
    const worker = loadWorker(async (url) =>
      url === "/" ? redirected("login page") : new Response(`page ${url}`),
    );
    await worker.install();
    expect([...worker.store.keys()]).toEqual(["/login"]);

    const offline = loadWorker(async () => {
      throw new TypeError("offline");
    });
    offline.store.set("/login", new Response("login page"));
    const response = await offline.navigate("/");
    expect(response?.redirected).toBe(false);
    expect(await response?.text()).toBe("login page");
  });

  it("caches the real home page on a signed-in visit", async () => {
    const worker = loadWorker(async () => new Response("home"));
    await worker.navigate("/");
    await vi.waitFor(() => expect(worker.store.has("/")).toBe(true));
    expect(await worker.store.get("/")?.text()).toBe("home");
  });

  it("doesn't cache a home visit that redirected", async () => {
    const worker = loadWorker(async () => redirected("login page"));
    await worker.navigate("/");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(worker.store.has("/")).toBe(false);
  });
});
