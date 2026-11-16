import { resetTestDb } from "@/lib/test/test-db";
import { type Db, createDb, runAsUser } from "@jim/db";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pruneTelemetry, recordClientTelemetry, recordServerFailure } from "../server";

const MAYA = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const THEO = "cccccccc-cccc-cccc-cccc-cccccccccccc";

describe.skipIf(!process.env.TEST_DATABASE_URL)("telemetry storage (#809)", () => {
  let owner: postgres.Sql;
  let db: Db;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    owner = await resetTestDb();
    db = createDb(process.env.TEST_DATABASE_URL as string);
    for (const [id, email] of [
      [MAYA, "maya@example.com"],
      [THEO, "theo@example.com"],
    ] as const) {
      await owner`INSERT INTO auth.users (id, email) VALUES (${id}, ${email})`;
      await owner`INSERT INTO users (id, email) VALUES (${id}, ${email})`;
    }
  }, 30_000);

  afterAll(async () => {
    await owner.end();
  });

  it("stores a user's batch as that user, fingerprinting failures only", async () => {
    await runAsUser(db, MAYA, (tx) =>
      recordClientTelemetry(tx, MAYA, [
        { kind: "error", name: "TypeError", message: "boom 1", stack: "at logSet (a.js:1:2)" },
        { kind: "vital", name: "LCP", value: 900, appVersion: "1.2.3", path: "/workout" },
      ]),
    );
    const rows = await owner<
      { kind: string; fingerprint: string | null; value: number | null; detail: unknown }[]
    >`SELECT kind, fingerprint, value, detail FROM telemetry_events WHERE user_id = ${MAYA} ORDER BY kind`;
    expect(rows[0]).toMatchObject({ kind: "error", value: null });
    expect(rows[0]?.fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(rows[0]?.detail).toEqual({ stack: "at logSet (a.js:1:2)" });
    expect(rows[1]).toMatchObject({ kind: "vital", fingerprint: null, value: 900 });
  });

  it("refuses a row tagged with another user", async () => {
    await expect(
      runAsUser(db, MAYA, (tx) => recordClientTelemetry(tx, THEO, [{ kind: "error", name: "E" }])),
    ).rejects.toThrow();
  });

  it("records server failures with no user", async () => {
    await recordServerFailure(db, {
      kind: "server_error",
      name: "Error",
      message: "db down",
      path: "/api/sync/pull",
      detail: { method: "GET" },
    });
    const [row] = await owner<{ user_id: string | null; path: string; detail: unknown }[]>`
      SELECT user_id, path, detail FROM telemetry_events WHERE kind = 'server_error'`;
    expect(row).toEqual({ user_id: null, path: "/api/sync/pull", detail: { method: "GET" } });
  });

  it("prunes rows past 30 days", async () => {
    await owner`
      INSERT INTO telemetry_events (kind, name, created_at)
      VALUES ('error', 'old', now() - interval '31 days'), ('error', 'recent', now() - interval '29 days')`;
    await pruneTelemetry(db);
    const names = await owner<{ name: string }[]>`
      SELECT name FROM telemetry_events WHERE name IN ('old', 'recent')`;
    expect(names.map((row) => row.name)).toEqual(["recent"]);
  });
});
