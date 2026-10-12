import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type JimDatabase, type RoutineRow, createTestDb } from "../../db/schema";
import {
  MAX_PUSH_FAILURES,
  PUSH_BATCH_SIZE,
  drainOutbox,
  pullChanges,
  runSyncCycle,
} from "../engine";
import { getSyncStatus } from "../status";

let testDb: JimDatabase;

beforeEach(() => {
  testDb = createTestDb(`jim-engine-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await testDb.delete();
});

function routine(overrides: Partial<RoutineRow> = {}): RoutineRow {
  return {
    id: crypto.randomUUID(),
    userId: "user-a",
    name: "Push Day",
    notes: null,
    position: 0,
    folder: null,
    kind: "strength",
    warmupRoutineId: null,
    warmupMinutes: null,
    iconShape: "square",
    iconColor: "blue",
    createdAt: new Date(),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    deviceId: "device-a",
    deletedAt: null,
    serverSeq: 0,
    ...overrides,
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("drainOutbox", () => {
  it("removes applied, duplicate and stale mutations, leaving errored ones queued", async () => {
    await testDb.outbox.bulkPut([
      { id: "m1", table: "routines", entity: routine({ id: "r1" }) },
      { id: "m2", table: "routines", entity: routine({ id: "r2" }) },
      { id: "m3", table: "routines", entity: routine({ id: "r3" }) },
      { id: "m4", table: "routines", entity: routine({ id: "r4" }) },
    ]);

    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [
          { id: "m1", status: "applied" },
          { id: "m2", status: "duplicate" },
          { id: "m3", status: "error" },
          { id: "m4", status: "stale" },
        ],
      }),
    );

    await drainOutbox(testDb, fetchMock);

    const remaining = await testDb.outbox.toArray();
    expect(remaining.map((entry) => entry.id)).toEqual(["m3"]);
    expect(getSyncStatus()).toEqual({ kind: "pending", count: 1 });
  });

  it("shows a mutation the server keeps rejecting as a sync error (#500)", async () => {
    await testDb.outbox.put({ id: "m1", table: "routines", entity: routine({ id: "r1" }) });
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => jsonResponse({ results: [{ id: "m1", status: "error" }] }));

    for (let attempt = 1; attempt < MAX_PUSH_FAILURES; attempt++) {
      await drainOutbox(testDb, fetchMock);
      expect(getSyncStatus()).toEqual({ kind: "pending", count: 1 });
    }
    await drainOutbox(testDb, fetchMock);

    expect(getSyncStatus()).toEqual({ kind: "error", count: 1 });
    expect((await testDb.outbox.get("m1"))?.failures).toBe(MAX_PUSH_FAILURES);
    const sent = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(sent.mutations[0]).not.toHaveProperty("failures");
  });

  it("reports synced immediately when the outbox is already empty", async () => {
    const fetchMock = vi.fn();
    await drainOutbox(testDb, fetchMock);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getSyncStatus()).toEqual({ kind: "synced" });
  });

  it("leaves the outbox untouched and reports error on a network failure", async () => {
    await testDb.outbox.put({ id: "m1", table: "routines", entity: routine({ id: "r1" }) });
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));

    await drainOutbox(testDb, fetchMock);

    expect(await testDb.outbox.count()).toBe(1);
    expect(getSyncStatus()).toEqual({ kind: "error", count: 1 });
  });

  it("leaves the outbox untouched and reports error on a non-2xx response", async () => {
    await testDb.outbox.put({ id: "m1", table: "routines", entity: routine({ id: "r1" }) });
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 500 }));

    await drainOutbox(testDb, fetchMock);

    expect(await testDb.outbox.count()).toBe(1);
    expect(getSyncStatus()).toEqual({ kind: "error", count: 1 });
  });

  it("pushes a large outbox in ordered batches, stopping at the first failed request", async () => {
    const total = PUSH_BATCH_SIZE * 2 + 5;
    await testDb.outbox.bulkPut(
      Array.from({ length: total }, (_, i) => ({
        id: `m${String(i).padStart(5, "0")}`,
        table: "routines" as const,
        entity: routine(),
      })),
    );
    const sent: string[][] = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const { mutations } = JSON.parse(String(init.body)) as { mutations: { id: string }[] };
      sent.push(mutations.map((m) => m.id));
      if (sent.length === 2) return new Response("", { status: 500 });
      return jsonResponse({ results: mutations.map((m) => ({ id: m.id, status: "applied" })) });
    });

    await drainOutbox(testDb, fetchMock as unknown as typeof fetch);

    expect(sent).toHaveLength(2);
    expect(sent[0]).toHaveLength(PUSH_BATCH_SIZE);
    expect(sent[0]?.[0]).toBe("m00000");
    expect(sent[1]?.[0]).toBe(`m${String(PUSH_BATCH_SIZE).padStart(5, "0")}`);
    expect(await testDb.outbox.count()).toBe(total - PUSH_BATCH_SIZE);
    expect(getSyncStatus()).toEqual({ kind: "error", count: total - PUSH_BATCH_SIZE });
  });
});

describe("pullChanges", () => {
  it("applies a pulled row and advances the cursor", async () => {
    const pulled = routine({ id: "r1", name: "From server" });
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        cursor: 42,
        changes: { routines: [{ ...pulled, updatedAt: pulled.updatedAt.toISOString() }] },
      }),
    );

    await pullChanges(testDb, fetchMock);

    expect(fetchMock).toHaveBeenCalledWith("/api/sync/pull?since=0");
    const stored = await testDb.routines.get("r1");
    expect(stored?.name).toBe("From server");
    expect(stored?.updatedAt).toBeInstanceOf(Date);

    const meta = await testDb.syncMeta.get("meta");
    expect(meta?.cursor).toBe(42);
  });

  it("overwrites a local row only when the pulled row is actually newer (LWW)", async () => {
    const localNewer = routine({
      id: "r1",
      name: "Local edit",
      updatedAt: new Date("2026-06-01T00:00:00Z"),
    });
    await testDb.routines.put(localNewer);

    const staleFromServer = routine({
      id: "r1",
      name: "Stale server copy",
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    });
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        cursor: 1,
        changes: {
          routines: [{ ...staleFromServer, updatedAt: staleFromServer.updatedAt.toISOString() }],
        },
      }),
    );

    await pullChanges(testDb, fetchMock);

    const stored = await testDb.routines.get("r1");
    expect(stored?.name).toBe("Local edit"); // the older pulled row did not win
  });

  it("uses the previous cursor on the next pull's request URL", async () => {
    await testDb.syncMeta.put({ id: "meta", cursor: 7, deviceId: "device-a" });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ cursor: 7, changes: {} }));

    await pullChanges(testDb, fetchMock);

    expect(fetchMock).toHaveBeenCalledWith("/api/sync/pull?since=7");
  });

  it("pulls from the start once after a schema upgrade adds tables (#501)", async () => {
    await testDb.syncMeta.put({
      id: "meta",
      cursor: 7,
      deviceId: "device-a",
      schemaVersion: testDb.verno - 1,
    });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ cursor: 9, changes: {} }));

    await pullChanges(testDb, fetchMock);
    await pullChanges(testDb, fetchMock);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/sync/pull?since=0",
      "/api/sync/pull?since=9",
    ]);
    expect((await testDb.syncMeta.get("meta"))?.schemaVersion).toBe(testDb.verno);
  });

  it("keeps a cursor saved before schema versions were recorded (#501)", async () => {
    await testDb.syncMeta.put({ id: "meta", cursor: 7, deviceId: "device-a" });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ cursor: 7, changes: {} }));

    await pullChanges(testDb, fetchMock);

    expect(fetchMock).toHaveBeenCalledWith("/api/sync/pull?since=7");
  });

  it("keeps pulling pages while the server says there are more (#489)", async () => {
    const page = (id: string, cursor: number, hasMore: boolean) => {
      const row = routine({ id, name: id });
      return jsonResponse({
        cursor,
        hasMore,
        changes: { routines: [{ ...row, updatedAt: row.updatedAt.toISOString() }] },
      });
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(page("r1", 10, true))
      .mockResolvedValueOnce(page("r2", 20, true))
      .mockResolvedValueOnce(page("r3", 30, false));

    await pullChanges(testDb, fetchMock);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/sync/pull?since=0",
      "/api/sync/pull?since=10",
      "/api/sync/pull?since=20",
    ]);
    expect(await testDb.routines.count()).toBe(3);
    expect((await testDb.syncMeta.get("meta"))?.cursor).toBe(30);
  });
});

describe("an expired session (#487)", () => {
  it("reports signed-out on a 401 push, keeps the outbox and skips the pull", async () => {
    await testDb.outbox.put({ id: "m1", table: "routines", entity: routine({ id: "r1" }) });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "unauthenticated" }, { status: 401 }));

    await runSyncCycle(testDb, fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await testDb.outbox.count()).toBe(1);
    expect(getSyncStatus()).toEqual({ kind: "signed-out", count: 1 });
  });

  it("reports error instead of throwing when a push answers with HTML", async () => {
    await testDb.outbox.put({ id: "m1", table: "routines", entity: routine({ id: "r1" }) });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("<html>Sign in</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    await expect(drainOutbox(testDb, fetchMock)).resolves.toBeUndefined();
    expect(await testDb.outbox.count()).toBe(1);
    expect(getSyncStatus()).toEqual({ kind: "error", count: 1 });
  });

  it("keeps the cursor and reports error when a pull answers with HTML", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("<html></html>", { status: 200 }));

    await expect(pullChanges(testDb, fetchMock)).resolves.toBeUndefined();
    expect((await testDb.syncMeta.get("meta"))?.cursor).toBe(0);
    expect(getSyncStatus()).toEqual({ kind: "error", count: 0 });
  });
});

describe("runSyncCycle single-flight (#532)", () => {
  /** A fetch whose pulls stay open until released, recording how many ran at once. */
  function gatedFetch() {
    const releases: Array<() => void> = [];
    let active = 0;
    let maxActive = 0;
    const fetchMock = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      return jsonResponse({ cursor: 0, changes: {} });
    });
    return { fetchMock, releases, maxActive: () => maxActive };
  }

  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("never runs two cycles at once and collapses callers into one follow-up", async () => {
    const { fetchMock, releases, maxActive } = gatedFetch();

    const first = runSyncCycle(testDb, fetchMock);
    const second = runSyncCycle(testDb, fetchMock);
    const third = runSyncCycle(testDb, fetchMock);
    expect(second).toBe(third);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    releases[0]?.();
    await first;
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    releases[1]?.();
    await Promise.all([second, third]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(maxActive()).toBe(1);
  });

  it("starts a fresh cycle once the previous one has finished", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ cursor: 0, changes: {} }));

    await runSyncCycle(testDb, fetchMock);
    await runSyncCycle(testDb, fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps separate databases independent", async () => {
    const other = createTestDb(`jim-engine-test-${crypto.randomUUID()}`);
    try {
      const { fetchMock, releases } = gatedFetch();
      const a = runSyncCycle(testDb, fetchMock);
      const b = runSyncCycle(other, fetchMock);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      for (const release of releases) release();
      await Promise.all([a, b]);
    } finally {
      await other.delete();
    }
  });
});
