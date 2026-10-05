import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USER_A, USER_B, resetTestDb, testContext } from "../../test/test-db.js";
import { getBodyMeasurements } from "../get-body-measurements.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)("get_body_measurements (#249)", () => {
  let admin: postgres.Sql;

  beforeAll(async () => {
    admin = await resetTestDb();
    await admin`
      INSERT INTO body_measurements (user_id, kind, value, unit, measured_at, deleted_at) VALUES
        (${USER_A}, 'bodyweight', 180, 'lb', '2026-09-01T08:00:00Z', NULL),
        (${USER_A}, 'bodyweight', 80, 'kg', '2026-09-15T08:00:00Z', NULL),
        (${USER_A}, 'waist', 82, 'cm', '2026-09-01T08:00:00Z', NULL),
        (${USER_A}, 'waist', 32, 'in', '2026-09-15T08:00:00Z', NULL),
        (${USER_A}, 'body_fat', 18.5, 'pct', '2026-09-15T08:00:00Z', NULL),
        (${USER_A}, 'neck', 40, 'cm', '2026-09-15T08:00:00Z', now()),
        (${USER_B}, 'waist', 30, 'in', '2026-09-15T08:00:00Z', NULL)
    `;
  });

  afterAll(async () => {
    await admin.end();
  });

  it("groups live entries by kind in the units the phone shows", async () => {
    const result = await getBodyMeasurements(testContext(USER_A), {});
    expect(result.units).toBe("lb");
    expect(result.measurements.map((m) => m.kind)).toEqual(["bodyweight", "body_fat", "waist"]);
    const [bodyweight, bodyFat, waist] = result.measurements;
    expect(bodyweight).toMatchObject({ unit: "lb", change: -3.63 });
    expect(bodyweight?.entries.map((e) => e.value)).toEqual([180, 176.37]);
    expect(bodyFat).toMatchObject({ unit: "pct", latest: { value: 18.5 }, change: null });
    expect(waist).toMatchObject({ unit: "in", latest: { value: 32 } });
    expect(waist?.entries.map((e) => e.value)).toEqual([32.28, 32]);
  });

  it("filters by kind and date", async () => {
    const result = await getBodyMeasurements(testContext(USER_A), {
      kinds: ["waist"],
      from: "2026-09-10T00:00:00Z",
    });
    expect(result.measurements).toHaveLength(1);
    expect(result.measurements[0]?.entries).toEqual([
      { value: 32, measuredAt: "2026-09-15T08:00:00.000Z" },
    ]);
  });
});
