import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const ORIGIN = "https://jim.test";
const TEMPLATE = readFileSync(new URL("../../../public/sw.template.js", import.meta.url), "utf8")
  .replaceAll("__BUILD_ID__", "test")
  .replace("__PRECACHE_URLS__", JSON.stringify(["/manifest.webmanifest"]))
  .replace("__PRECACHE_PAGES__", JSON.stringify(["/workout", "/login"]));

/** A network response for a page, as fetch would report it after any redirects. */
function page(body: string, finalPath: string, { redirected = false } = {}): Response {
  const response = new Response(body, { headers: { "content-type": "text/html" } });
  Object.defineProperty(response, "url", { value: `${ORIGIN}${finalPath}` });
  Object.defineProperty(response, "redirected", { value: redirected });
  return response;
}

/** Runs the real worker template against in-memory caches and a stubbed network (#506, #661). */
function loadWorker(network: (url: string) => Promise<Response>) {
  const handlers = new Map<string, (event: unknown) => void>();
  const stores = new Map<string, Map<string, Response>>();
  function store(name: string) {
    let entries = stores.get(name);
    if (!entries) {
      entries = new Map();
      stores.set(name, entries);
    }
    return entries;
  }
  const context = {
    self: {
      location: { origin: ORIGIN },
      addEventListener: (type: string, handler: (event: unknown) => void) =>
        handlers.set(type, handler),
      skipWaiting: async () => {},
    },
    caches: {
      open: async (name: string) => ({
        put: async (url: string, response: Response) => {
          store(name).set(url, response);
        },
        match: async (url: string) => store(name).get(url)?.clone(),
      }),
    },
    fetch: vi.fn(async (input: string | { url: string }) =>
      network(typeof input === "string" ? input : new URL(input.url).pathname),
    ),
    Response,
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
    pages: store("jim-pages-test"),
    install: () => dispatch("install", {}),
    navigate: (path: string) =>
      dispatch("fetch", {
        request: { method: "GET", url: `${ORIGIN}${path}`, mode: "navigate" },
      }) as Promise<Response | undefined>,
  };
}

const offline = async (): Promise<Response> => {
  throw new TypeError("offline");
};

describe("service worker offline shell", () => {
  it("precaches the Workout page for a signed-in install", async () => {
    const worker = loadWorker(async (url) =>
      url === "/login" ? page("workout", "/workout", { redirected: true }) : page(url, url),
    );
    await worker.install();
    expect(await worker.pages.get("/workout")?.text()).toBe("workout");
  });

  it("stores a signed-out install's redirect as the login page, never as /workout", async () => {
    const worker = loadWorker(async (url) =>
      url === "/workout" ? page("login", "/login", { redirected: true }) : page("login", url),
    );
    await worker.install();
    expect(worker.pages.has("/workout")).toBe(false);
    expect(await worker.pages.get("/login")?.text()).toBe("login");
  });

  it("still installs when a page can't be fetched", async () => {
    const worker = loadWorker(async (url) => {
      if (url === "/manifest.webmanifest") return new Response("{}");
      throw new TypeError("offline");
    });
    await worker.install();
    expect(worker.pages.size).toBe(0);
  });

  it("caches where '/' lands, as a response that isn't marked redirected", async () => {
    const worker = loadWorker(async () => page("workout", "/workout", { redirected: true }));
    await worker.navigate("/");
    await vi.waitFor(() => expect(worker.pages.has("/workout")).toBe(true));
    expect(worker.pages.get("/workout")?.redirected).toBe(false);
  });

  it("opens offline on the cached Workout page, from '/' or a page it never cached", async () => {
    const worker = loadWorker(offline);
    worker.pages.set("/workout", page("workout", "/workout"));
    worker.pages.set("/login", page("login", "/login"));
    expect(await (await worker.navigate("/"))?.text()).toBe("workout");
    expect(await (await worker.navigate("/history/abc"))?.text()).toBe("workout");
  });

  it("opens offline on the page itself when it was cached", async () => {
    const worker = loadWorker(offline);
    worker.pages.set("/workout", page("workout", "/workout"));
    worker.pages.set("/routines", page("routines", "/routines"));
    expect(await (await worker.navigate("/routines"))?.text()).toBe("routines");
  });

  it("falls back to the login page offline when signed out", async () => {
    const worker = loadWorker(offline);
    worker.pages.set("/login", page("login", "/login"));
    expect(await (await worker.navigate("/"))?.text()).toBe("login");
  });

  it("doesn't cache a navigation that isn't HTML", async () => {
    const worker = loadWorker(async () => {
      const response = new Response("{}", { headers: { "content-type": "application/json" } });
      Object.defineProperty(response, "url", { value: `${ORIGIN}/export` });
      return response;
    });
    await worker.navigate("/export");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(worker.pages.size).toBe(0);
  });
});
