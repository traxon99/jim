import { describe, expect, it, vi } from "vitest";
import {
  RESET_NOTICE_KEY,
  type RemoteCommandDeps,
  type RemoteCommands,
  applyRemoteCommands,
  isRemoteCommands,
  pendingRemoteCommands,
  takeResetNotice,
} from "../remote-commands";

const USER = "user-1";
const T1 = "2026-11-16T10:00:00.000Z";
const T2 = "2026-11-16T11:00:00.000Z";

function commands(update: string | null, reset: string | null, userId = USER): RemoteCommands {
  return { userId, updateRequestedAt: update, resetRequestedAt: reset };
}

function fakeDeps(options: { handled?: object; hidden?: boolean; outbox?: number } = {}) {
  const store = new Map<string, string>();
  if (options.handled) store.set("jim-remote-commands", JSON.stringify(options.handled));
  const listeners = new Set<() => void>();
  const doc = {
    visibilityState: (options.hidden ? "hidden" : "visible") as DocumentVisibilityState,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  let outbox = options.outbox ?? 0;
  const deps = {
    storage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    },
    doc,
    checkForUpdate: vi.fn(async () => {}),
    reload: vi.fn(),
    outboxCount: vi.fn(async () => outbox),
    wipe: vi.fn(async () => {}),
  };
  return {
    deps: deps as unknown as RemoteCommandDeps,
    raw: deps,
    store,
    handled: () => JSON.parse(store.get("jim-remote-commands") ?? "null"),
    hide: () => {
      doc.visibilityState = "hidden";
      for (const fn of [...listeners]) fn();
    },
    setOutbox: (count: number) => {
      outbox = count;
    },
  };
}

describe("remote commands (#808)", () => {
  it("recognises the pull's commands shape", () => {
    expect(isRemoteCommands(commands(T1, null))).toBe(true);
    expect(isRemoteCommands({ userId: USER, updateRequestedAt: 1, resetRequestedAt: null })).toBe(
      false,
    );
    expect(isRemoteCommands(null)).toBe(false);
  });

  it("adopts the requests a device has never seen, without acting", () => {
    expect(pendingRemoteCommands(commands(T1, T1), null)).toEqual({
      update: false,
      reset: false,
      adopt: true,
    });
    // Another account signed in on this phone: its requests aren't this one's.
    expect(
      pendingRemoteCommands(commands(T2, null), { userId: "other", update: null, reset: null }),
    ).toMatchObject({ adopt: true });
  });

  it("acts only on requests newer than the last one handled", () => {
    const handled = { userId: USER, update: T1, reset: null };
    expect(pendingRemoteCommands(commands(T1, null), handled)).toMatchObject({
      update: false,
      reset: false,
    });
    expect(pendingRemoteCommands(commands(T2, T1), handled)).toMatchObject({
      update: true,
      reset: true,
    });
  });

  it("first sight stores the stamps and does nothing else", async () => {
    const fake = fakeDeps({ hidden: true });
    await applyRemoteCommands(commands(T1, T1), undefined, fake.deps);
    expect(fake.handled()).toEqual({ userId: USER, update: T1, reset: T1 });
    expect(fake.raw.reload).not.toHaveBeenCalled();
    expect(fake.raw.wipe).not.toHaveBeenCalled();
  });

  it("update checks for a new version now and reloads once in the background", async () => {
    const fake = fakeDeps({ handled: { userId: USER, update: null, reset: null } });
    const done = applyRemoteCommands(commands(T1, null), undefined, fake.deps);
    await vi.waitFor(() => expect(fake.raw.checkForUpdate).toHaveBeenCalled());
    expect(fake.raw.reload).not.toHaveBeenCalled();
    fake.hide();
    await done;
    expect(fake.raw.reload).toHaveBeenCalledTimes(1);
    expect(fake.handled().update).toBe(T1);
  });

  it("reset waits while changes are unsynced", async () => {
    const fake = fakeDeps({ handled: { userId: USER, update: null, reset: null }, outbox: 2 });
    fake.hide();
    await applyRemoteCommands(commands(null, T1), undefined, fake.deps);
    expect(fake.raw.wipe).not.toHaveBeenCalled();
    expect(fake.handled().reset).toBeNull();
  });

  it("reset wipes, leaves the notice and reloads once the outbox is empty and the app is away", async () => {
    const fake = fakeDeps({ handled: { userId: USER, update: null, reset: null } });
    const done = applyRemoteCommands(commands(T1, T2), undefined, fake.deps);
    await vi.waitFor(() => expect(fake.raw.outboxCount).toHaveBeenCalled());
    expect(fake.raw.wipe).not.toHaveBeenCalled();
    fake.hide();
    await done;
    expect(fake.raw.wipe).toHaveBeenCalledTimes(1);
    expect(fake.raw.reload).toHaveBeenCalledTimes(1);
    // The reload covers the update too.
    expect(fake.handled()).toEqual({ userId: USER, update: T1, reset: T2 });
    expect(fake.store.get(RESET_NOTICE_KEY)).toBe("1");
  });

  it("reset skips a change logged between the pull and the app going away", async () => {
    const fake = fakeDeps({ handled: { userId: USER, update: null, reset: null } });
    const done = applyRemoteCommands(commands(null, T1), undefined, fake.deps);
    await vi.waitFor(() => expect(fake.raw.outboxCount).toHaveBeenCalled());
    fake.setOutbox(1);
    fake.hide();
    await done;
    expect(fake.raw.wipe).not.toHaveBeenCalled();
    expect(fake.handled().reset).toBeNull();
  });

  it("the reset notice shows once", () => {
    const store = new Map([[RESET_NOTICE_KEY, "1"]]);
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => void store.delete(key),
    };
    expect(takeResetNotice(storage)).toBe(true);
    expect(takeResetNotice(storage)).toBe(false);
  });
});
