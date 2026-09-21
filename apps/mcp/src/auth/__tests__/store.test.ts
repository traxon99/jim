import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExpiringStore } from "../store";

describe("ExpiringStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a value that was set", () => {
    const store = new ExpiringStore<{ createdAt: number; value: string }>(1000);
    store.set("a", { createdAt: Date.now(), value: "hello" });
    expect(store.peek("a")?.value).toBe("hello");
  });

  it("peek does not remove the entry", () => {
    const store = new ExpiringStore<{ createdAt: number }>(1000);
    store.set("a", { createdAt: Date.now() });
    store.peek("a");
    expect(store.peek("a")).toBeDefined();
  });

  it("take removes the entry after reading it once", () => {
    const store = new ExpiringStore<{ createdAt: number }>(1000);
    store.set("a", { createdAt: Date.now() });
    expect(store.take("a")).toBeDefined();
    expect(store.take("a")).toBeUndefined();
    expect(store.peek("a")).toBeUndefined();
  });

  it("expires an entry once its TTL has elapsed", () => {
    const store = new ExpiringStore<{ createdAt: number }>(1000);
    store.set("a", { createdAt: Date.now() });

    vi.advanceTimersByTime(999);
    expect(store.peek("a")).toBeDefined();

    vi.advanceTimersByTime(2);
    expect(store.peek("a")).toBeUndefined();
  });

  it("returns undefined for a key that was never set", () => {
    const store = new ExpiringStore<{ createdAt: number }>(1000);
    expect(store.peek("missing")).toBeUndefined();
    expect(store.take("missing")).toBeUndefined();
  });
});
