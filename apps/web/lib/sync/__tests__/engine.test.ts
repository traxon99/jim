import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type JimDatabase, type RoutineRow, createTestDb } from "../../db/schema";
import { PUSH_BATCH_SIZE, drainOutbox, pullChanges } from "../engine";
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
  it("removes applied and duplicate mutations, leaving errored ones queued", async () => {
    await testDb.outbox.bulkPut([
      { id: "m1", table: "routines", entity: routine({ id: "r1" }) },
      { id: "m2", table: "routines", entity: routine({ id: "r2" }) },
      { id: "m3", table: "routines", entity: routine({ id: "r3" }) },
    ]);

    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [
          { id: "m1", status: "applied" },
          { id: "m2", status: "duplicate" },
          { id: "m3", status: "error" },
        ],
      }),
    );

    await drainOutbox(testDb, fetchMock);

    const remaining = await testDb.outbox.toArray();
    expect(remaining.map((entry) => entry.id)).toEqual(["m3"]);
    expect(getSyncStatus()).toEqual({ kind: "pending", count: 1 });
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
});
