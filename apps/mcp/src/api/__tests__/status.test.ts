import { v1ErrorSchema, v1StatusSchema } from "@jim/core";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../../db.js";
import { USER_A, USER_B, resetTestDb } from "../../test/test-db.js";
import { V1_FAILED_AUTH_PER_MINUTE, V1_RATE_LIMIT_PER_MINUTE } from "../router.js";
import { insertToken, startV1 } from "./v1-helpers.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)("GET /v1/status (#737)", () => {
  let admin: postgres.Sql;
  let api: Awaited<ReturnType<typeof startV1>>;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    admin = await resetTestDb();
    api = await startV1();
  });

  afterAll(async () => {
    await api.close();
    await admin.end();
    await getDb().$client.end();
  });

  it("answers 401 in the error shape without a valid token", async () => {
    for (const token of [undefined, "not-a-pat", "jim_pat_unknown"]) {
      const res = await api.get("/v1/status", token);
      expect(res.status).toBe(401);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
      const body = v1ErrorSchema.parse(await res.json());
      expect(body.error.code).toBe("unauthorized");
    }
  });

  it("returns the token user's status, and only theirs", async () => {
    await admin`UPDATE users SET username = 'jackson', units = 'kg', week_start = 1,
      time_zone = 'America/Chicago' WHERE id = ${USER_A}`;
    await admin`INSERT INTO routines (id, user_id, name)
      VALUES ('00000000-0000-7000-8000-00000000000a', ${USER_A}, 'Push A')`;
    await admin`INSERT INTO sessions (user_id, device_id, routine_id, started_at)
      VALUES (${USER_A}, 'phone', '00000000-0000-7000-8000-00000000000a', '2026-11-03T22:10:00Z')`;
    await admin`INSERT INTO sync_mutations (id, user_id, applied_at) VALUES
      (gen_random_uuid(), ${USER_A}, '2026-11-03T22:41:09Z'),
      (gen_random_uuid(), ${USER_A}, '2026-11-01T10:00:00Z'),
      (gen_random_uuid(), ${USER_B}, '2026-11-04T09:00:00Z')`;
    // B has a workout in progress too; A's token mustn't see it.
    await admin`INSERT INTO sessions (user_id, device_id, name, started_at)
      VALUES (${USER_B}, 'phone', 'B workout', '2026-11-04T08:00:00Z')`;

    const res = await api.get("/v1/status", await insertToken(admin, USER_A));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, max-age=60");
    const body = v1StatusSchema.parse(await res.json());
    expect(body).toMatchObject({
      user: { username: "jackson", units: "kg", weekStart: 1, timeZone: "America/Chicago" },
      lastSyncedAt: "2026-11-03T22:41:09.000Z",
      activeWorkout: { name: "Push A", startedAt: "2026-11-03T22:10:00.000Z" },
      tokenScope: "read",
    });

    const asB = v1StatusSchema.parse(
      await (await api.get("/v1/status", await insertToken(admin, USER_B, "read_write"))).json(),
    );
    expect(asB.activeWorkout?.name).toBe("B workout");
    expect(asB.lastSyncedAt).toBe("2026-11-04T09:00:00.000Z");
    expect(asB.tokenScope).toBe("read_write");
  });

  it("returns nulls for a user with nothing synced and no workout open", async () => {
    await admin`DELETE FROM sync_mutations`;
    await admin`UPDATE sessions SET ended_at = now()`;
    const body = v1StatusSchema.parse(
      await (await api.get("/v1/status", await insertToken(admin, USER_A))).json(),
    );
    expect(body.lastSyncedAt).toBeNull();
    expect(body.activeWorkout).toBeNull();
  });

  it("answers an unknown path with not_found", async () => {
    const res = await api.get("/v1/nope", await insertToken(admin, USER_A));
    expect(res.status).toBe(404);
    expect(v1ErrorSchema.parse(await res.json()).error.code).toBe("not_found");
  });

  // Keep last: it uses up this token's window.
  it("rate limits per token with Retry-After", async () => {
    const token = await insertToken(admin, USER_A);
    let last: Response | undefined;
    for (let i = 0; i <= V1_RATE_LIMIT_PER_MINUTE; i++) last = await api.get("/v1/nope", token);
    expect(last?.status).toBe(429);
    expect(Number(last?.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(v1ErrorSchema.parse(await last?.json()).error.code).toBe("rate_limited");
    // Another token still gets through.
    expect((await api.get("/v1/status", await insertToken(admin, USER_A))).status).toBe(200);
  });

  // Keep last: it locks this IP out for the rest of the window.
  it("limits failed sign-ins per IP, so made-up tokens can't flood the database", async () => {
    let last: Response | undefined;
    for (let i = 0; i <= V1_FAILED_AUTH_PER_MINUTE; i++) {
      last = await api.get("/v1/status", `jim_pat_guess${i}`);
    }
    expect(last?.status).toBe(429);
    expect(Number(last?.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});
