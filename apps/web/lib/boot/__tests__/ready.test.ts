import { isBootReady, registerBootTask, subscribeBootReady } from "@/lib/boot/ready";
import { describe, expect, it } from "vitest";

// `pending` is module-level state shared across these cases, so every test
// balances its own register/done calls and leaves the count back at zero.
describe("boot readiness", () => {
  it("is ready with nothing registered", () => {
    expect(isBootReady()).toBe(true);
  });

  it("is not ready while a task is outstanding", () => {
    const done = registerBootTask();
    expect(isBootReady()).toBe(false);
    done();
    expect(isBootReady()).toBe(true);
  });

  it("waits for every registered task", () => {
    const doneA = registerBootTask();
    const doneB = registerBootTask();
    expect(isBootReady()).toBe(false);

    doneA();
    expect(isBootReady()).toBe(false);

    doneB();
    expect(isBootReady()).toBe(true);
  });

  it("ignores a second call to the same done callback", () => {
    const done = registerBootTask();
    done();
    done();
    expect(isBootReady()).toBe(true);
  });

  it("notifies subscribers when a task registers and settles", () => {
    const notifications: boolean[] = [];
    const unsubscribe = subscribeBootReady(() => notifications.push(isBootReady()));

    const done = registerBootTask();
    done();

    expect(notifications).toEqual([false, true]);
    unsubscribe();
  });
});
