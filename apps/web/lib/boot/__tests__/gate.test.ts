import { type GateEnv, runBootGate } from "@/lib/boot/gate";
import { isBootReady, registerBootTask, trackBootPromise } from "@/lib/boot/ready";
import { afterEach, describe, expect, it, vi } from "vitest";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** A fake environment where every step resolves immediately unless overridden. */
function fakeEnv(overrides: Partial<GateEnv> = {}): GateEnv {
  return {
    windowLoaded: () => Promise.resolve(),
    fontsReady: () => Promise.resolve(),
    imagesLoaded: () => Promise.resolve(),
    domQuiet: () => Promise.resolve(),
    nextFrames: () => Promise.resolve(),
    assetsSettled: () => true,
    now: () => 0,
    delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    ...overrides,
  };
}

const options = { quietMs: 250, minVisibleMs: 0, backstopMs: 15_000 };

async function settledWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  let done = false;
  void promise.then(() => {
    done = true;
  });
  await vi.advanceTimersByTimeAsync(ms);
  return done;
}

// Boot tasks are module-level state, so each test settles what it registers.
describe("boot gate", () => {
  afterEach(() => {
    vi.useRealTimers();
    expect(isBootReady()).toBe(true);
  });

  it("settles when everything is already loaded", async () => {
    vi.useFakeTimers();
    const result = runBootGate(fakeEnv(), options);
    await vi.advanceTimersByTimeAsync(0);
    await expect(result).resolves.toBe("settled");
  });

  it("waits for the window load event", async () => {
    vi.useFakeTimers();
    const load = deferred();
    const result = runBootGate(fakeEnv({ windowLoaded: () => load.promise }), options);
    expect(await settledWithin(result, 1000)).toBe(false);
    load.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await expect(result).resolves.toBe("settled");
  });

  it("waits for every outstanding boot task", async () => {
    vi.useFakeTimers();
    const done = registerBootTask();
    const result = runBootGate(fakeEnv(), options);
    expect(await settledWithin(result, 5000)).toBe(false);
    done();
    await vi.advanceTimersByTimeAsync(0);
    await expect(result).resolves.toBe("settled");
  });

  it("goes round again when a task registers during the quiet wait", async () => {
    vi.useFakeTimers();
    let lateTask: (() => void) | undefined;
    let quietWaits = 0;
    const env = fakeEnv({
      domQuiet: async () => {
        quietWaits += 1;
        // A data load lands and kicks off another query mid-wait.
        if (quietWaits === 1) lateTask = registerBootTask();
      },
    });
    const result = runBootGate(env, options);
    expect(await settledWithin(result, 1000)).toBe(false);
    lateTask?.();
    await vi.advanceTimersByTimeAsync(0);
    await expect(result).resolves.toBe("settled");
    expect(quietWaits).toBe(2);
  });

  it("goes round again until fonts and images have settled", async () => {
    vi.useFakeTimers();
    let checks = 0;
    const env = fakeEnv({ assetsSettled: () => ++checks >= 3 });
    const result = runBootGate(env, options);
    await vi.advanceTimersByTimeAsync(0);
    await expect(result).resolves.toBe("settled");
    expect(checks).toBe(3);
  });

  it("holds for the cold-open intro's minimum time", async () => {
    vi.useFakeTimers();
    const env = fakeEnv({ now: () => 400 });
    const result = runBootGate(env, { ...options, minVisibleMs: 1400 });
    expect(await settledWithin(result, 999)).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe("settled");
  });

  it("lifts at the backstop if something never settles", async () => {
    vi.useFakeTimers();
    const done = registerBootTask();
    const result = runBootGate(fakeEnv(), options);
    expect(await settledWithin(result, 14_999)).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe("backstop");
    done();
  });
});

describe("trackBootPromise", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds boot until the promise settles", async () => {
    const work = deferred();
    trackBootPromise(work.promise, 5000);
    expect(isBootReady()).toBe(false);
    work.resolve();
    await work.promise;
    await Promise.resolve();
    expect(isBootReady()).toBe(true);
  });

  it("releases boot when the promise rejects", async () => {
    const failing = Promise.reject(new Error("offline"));
    trackBootPromise(failing, 5000);
    await failing.catch(() => {});
    await Promise.resolve();
    expect(isBootReady()).toBe(true);
  });

  it("releases boot at the cap if the promise hangs", async () => {
    vi.useFakeTimers();
    trackBootPromise(new Promise(() => {}), 5000);
    await vi.advanceTimersByTimeAsync(4999);
    expect(isBootReady()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(isBootReady()).toBe(true);
  });
});
