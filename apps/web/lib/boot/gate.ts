import { isBootReady, subscribeBootReady } from "./ready";

/**
 * Decides when the boot splash (components/loading-screen.tsx) lifts. It
 * lifts once, and then never comes back for the life of the page: later
 * "Loading…" states (opening a routine, a new route) are ordinary in-app
 * loading, not boot, so the gate latches instead of tracking them.
 *
 * "Settled" means all of these hold at the same moment, checked in a loop
 * until they do:
 *   1. the window "load" event has fired (HTML, CSS, scripts, initial images),
 *   2. every registered boot task has settled (visible "Loading…"
 *      placeholders, the appearance settings row, the first sync — see
 *      registerBootTask / useBootTask / trackBootPromise),
 *   3. web fonts have loaded (`document.fonts.ready`),
 *   4. every eager <img> on the page has loaded or failed,
 *   5. the DOM has gone `quietMs` without a single mutation, so whatever
 *      the last data load re-rendered has finished re-rendering, and
 *   6. two animation frames have painted after that.
 * Anything that changes during the quiet wait sends it round the loop again.
 *
 * `backstopMs` is the one exception: if something never settles (a request
 * that hangs on bad reception, a ticking clock that keeps mutating the DOM),
 * the splash lifts anyway rather than locking the user out of the app.
 */

export interface GateEnv {
  windowLoaded(): Promise<void>;
  fontsReady(): Promise<void>;
  imagesLoaded(): Promise<void>;
  domQuiet(quietMs: number): Promise<void>;
  nextFrames(): Promise<void>;
  /** Re-checks fonts and images synchronously, after the quiet wait. */
  assetsSettled(): boolean;
  /** Milliseconds since the page started loading. */
  now(): number;
  delay(ms: number): Promise<void>;
}

export interface GateOptions {
  quietMs: number;
  /** The splash stays up at least this long after page start (the cold-open intro). */
  minVisibleMs: number;
  backstopMs: number;
}

export const GATE_DEFAULTS: GateOptions = {
  quietMs: 250,
  minVisibleMs: 0,
  backstopMs: 15_000,
};

function bootTasksSettled(): Promise<void> {
  if (isBootReady()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = subscribeBootReady(() => {
      if (!isBootReady()) return;
      unsubscribe();
      resolve();
    });
  });
}

async function waitUntilSettled(env: GateEnv, options: GateOptions): Promise<void> {
  await env.windowLoaded();
  for (;;) {
    await bootTasksSettled();
    await env.fontsReady();
    await env.imagesLoaded();
    await env.domQuiet(options.quietMs);
    await env.nextFrames();
    if (isBootReady() && env.assetsSettled()) break;
  }
  const remaining = options.minVisibleMs - env.now();
  if (remaining > 0) await env.delay(remaining);
}

/** Resolves "settled" when everything above holds, or "backstop" if that took too long. */
export function runBootGate(env: GateEnv, options: GateOptions): Promise<"settled" | "backstop"> {
  return Promise.race([
    waitUntilSettled(env, options).then(() => "settled" as const),
    env.delay(options.backstopMs).then(() => "backstop" as const),
  ]);
}

// ---------------------------------------------------------------------------
// Browser wiring: a single page-wide gate shared by the splash and AppReveal.

type Listener = () => void;

let revealed = false;
let started = false;
const listeners = new Set<Listener>();

export function isBootRevealed(): boolean {
  return revealed;
}

/** For `useSyncExternalStore` in components. */
export function subscribeBootRevealed(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function reveal(): void {
  if (revealed) return;
  revealed = true;
  for (const listener of listeners) listener();
}

/** The splash itself; its own DOM changes (fade, exit) don't count against quiet. */
const SPLASH_SELECTOR = ".loading-screen";

function browserEnv(): GateEnv {
  const eagerImages = () => Array.from(document.images).filter((image) => image.loading !== "lazy");

  return {
    windowLoaded: () =>
      document.readyState === "complete"
        ? Promise.resolve()
        : new Promise((resolve) =>
            window.addEventListener("load", () => resolve(), { once: true }),
          ),
    fontsReady: async () => {
      await document.fonts?.ready;
    },
    imagesLoaded: async () => {
      await Promise.all(
        eagerImages()
          .filter((image) => !image.complete)
          .map(
            (image) =>
              new Promise<void>((resolve) => {
                image.addEventListener("load", () => resolve(), { once: true });
                image.addEventListener("error", () => resolve(), { once: true });
              }),
          ),
      );
    },
    domQuiet: (quietMs) =>
      new Promise((resolve) => {
        let timer = setTimeout(done, quietMs);
        const observer = new MutationObserver((records) => {
          const relevant = records.some((record) => {
            const node = record.target;
            const element = node instanceof Element ? node : node.parentElement;
            return !element?.closest(SPLASH_SELECTOR);
          });
          if (!relevant) return;
          clearTimeout(timer);
          timer = setTimeout(done, quietMs);
        });
        observer.observe(document.documentElement, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        });
        function done() {
          observer.disconnect();
          resolve();
        }
      }),
    nextFrames: () =>
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    assetsSettled: () =>
      (document.fonts?.status ?? "loaded") === "loaded" &&
      eagerImages().every((image) => image.complete),
    now: () => performance.now(),
    delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

/**
 * Starts the page's gate (idempotent). Call from an effect, i.e. after
 * hydration, so every component's first-commit boot tasks are registered.
 */
export function startBootGate(options: Partial<GateOptions> = {}): void {
  if (started) return;
  started = true;
  void runBootGate(browserEnv(), { ...GATE_DEFAULTS, ...options }).then(reveal);
}
