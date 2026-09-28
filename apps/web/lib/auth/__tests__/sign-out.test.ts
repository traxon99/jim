import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type JimDatabase, createTestDb } from "../../db/schema";
import { clearAuthCookies, clearLocalData, flushOutboxBeforeSignOut } from "../sign-out";

let testDb: JimDatabase;

beforeEach(() => {
  testDb = createTestDb(`jim-sign-out-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await testDb.delete();
});

function queueMutation(id: string) {
  return testDb.outbox.add({
    id,
    table: "routines",
    entity: { id: crypto.randomUUID() },
  } as never);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("flushOutboxBeforeSignOut", () => {
  it("skips the network when nothing is queued", async () => {
    const fetchImpl = vi.fn();
    expect(await flushOutboxBeforeSignOut(testDb, fetchImpl)).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("pushes queued mutations and reports none left once they apply", async () => {
    await queueMutation("m1");
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ results: [{ id: "m1", status: "applied" }] }),
    );
    expect(await flushOutboxBeforeSignOut(testDb, fetchImpl)).toBe(0);
  });

  it("reports what's still unsynced when the push fails", async () => {
    await queueMutation("m1");
    await queueMutation("m2");
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("offline");
    });
    expect(await flushOutboxBeforeSignOut(testDb, fetchImpl)).toBe(2);
  });
});

describe("clearLocalData", () => {
  it("wipes every table so the next account starts empty", async () => {
    await queueMutation("m1");
    await testDb.syncMeta.put({ id: "meta", cursor: 42, deviceId: "device-a" });

    await clearLocalData(testDb);

    const reopened = createTestDb(testDb.name);
    expect(await reopened.outbox.count()).toBe(0);
    expect(await reopened.syncMeta.get("meta")).toBeUndefined();
    reopened.close();
  });
});

describe("clearAuthCookies", () => {
  it("expires only the Supabase auth cookies, chunks included", () => {
    const written: string[] = [];
    const doc = {
      get cookie() {
        return "sb-abc-auth-token.0=x; theme=dark; sb-abc-auth-token.1=y";
      },
      set cookie(value: string) {
        written.push(value);
      },
    };

    clearAuthCookies(doc);

    expect(written).toEqual([
      "sb-abc-auth-token.0=; Max-Age=0; path=/",
      "sb-abc-auth-token.1=; Max-Age=0; path=/",
    ]);
  });
});
