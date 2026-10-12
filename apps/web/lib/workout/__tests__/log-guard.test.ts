import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogGuard } from "../log-guard";

afterEach(() => {
  vi.useRealTimers();
});

describe("createLogGuard (#491)", () => {
  it("skips a second log while the first is in flight", async () => {
    const guard = createLogGuard();
    let finish: () => void = () => {};
    const log = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );

    const first = guard.run(log);
    const second = guard.run(log);
    finish();

    expect(await first).toBe(true);
    expect(await second).toBe(false);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("stays closed after the log resolves until released", async () => {
    const guard = createLogGuard();
    const log = vi.fn(async () => {});

    await guard.run(log);
    expect(await guard.run(log)).toBe(false);

    guard.release();
    expect(await guard.run(log)).toBe(true);
    expect(log).toHaveBeenCalledTimes(2);
  });

  it("reopens when the log throws", async () => {
    const guard = createLogGuard();
    await expect(guard.run(() => Promise.reject(new Error("idb")))).rejects.toThrow("idb");
    expect(await guard.run(async () => {})).toBe(true);
  });

  it("reopens after the backstop if nothing releases it", async () => {
    vi.useFakeTimers();
    const guard = createLogGuard(2000);
    await guard.run(async () => {});
    vi.advanceTimersByTime(2000);
    expect(await guard.run(async () => {})).toBe(true);
  });
});
