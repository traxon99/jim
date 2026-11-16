import { resetTestDb } from "@/lib/test/test-db";
import { type Db, createDb, runAsUser } from "@jim/db";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  TELEMETRY_RATE_LIMIT,
  pruneTelemetry,
  recordClientTelemetry,
  recordServerFailure,
  storableError,
  telemetryAllowance,
} from "../server";

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

  it("stores a user's batch tagged with them, fingerprinting failures only", async () => {
    await recordClientTelemetry(db, MAYA, [
      { kind: "error", name: "TypeError", message: "boom 1", stack: "at logSet (a.js:1:2)" },
      { kind: "vital", name: "LCP", value: 900, appVersion: "1.2.3", path: "/workout" },
    ]);
    const rows = await owner<
      { kind: string; fingerprint: string | null; value: number | null; detail: unknown }[]
    >`SELECT kind, fingerprint, value, detail FROM telemetry_events WHERE user_id = ${MAYA} ORDER BY kind`;
    expect(rows[0]).toMatchObject({ kind: "error", value: null });
    expect(rows[0]?.fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(rows[0]?.detail).toEqual({ stack: "at logSet (a.js:1:2)" });
    expect(rows[1]).toMatchObject({ kind: "vital", fingerprint: null, value: 900 });
  });

  it("lets no signed-in user write or read rows directly", async () => {
    await expect(
      runAsUser(db, MAYA, (tx) => recordClientTelemetry(tx, MAYA, [{ kind: "error", name: "E" }])),
    ).rejects.toThrow();
    const seen = await runAsUser(db, MAYA, (tx) => tx.execute("SELECT * FROM telemetry_events"));
    expect([...seen]).toHaveLength(0);
  });

  it("limits how much one account may add", async () => {
    expect(await telemetryAllowance(db, THEO)).toBe(TELEMETRY_RATE_LIMIT);
    await recordClientTelemetry(
      db,
      THEO,
      Array.from({ length: 50 }, () => ({ kind: "vital" as const, name: "LCP", value: 1 })),
    );
    expect(await telemetryAllowance(db, THEO)).toBe(TELEMETRY_RATE_LIMIT - 50);
  });

  it("keeps a database error's cause, never its SQL or params", () => {
    const query = Object.assign(new Error("Failed query: select 1 where w = $1\nparams: 102.5"), {
      name: "DrizzleQueryError",
      cause: new Error("deadlock detected"),
    });
    expect(storableError(query).message).toBe("deadlock detected");
    expect(storableError(new Error("Failed query: x")).message).toBe("Database query failed");
    expect(storableError("plain").message).toBe("plain");
  });

  it("records server failures with no user", async () => {
    await recordServerFailure(db, {
      kind: "server_error",
      name: "Error",
      message: "db down",
      path: "/share/3f2a1b9c-1111-4222-8333-944445555666",
      detail: { method: "GET" },
    });
    const [row] = await owner<{ user_id: string | null; path: string; detail: unknown }[]>`
      SELECT user_id, path, detail FROM telemetry_events WHERE kind = 'server_error'`;
    expect(row).toEqual({ user_id: null, path: "/share/:id", detail: { method: "GET" } });
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
