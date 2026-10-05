import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  bodyweightLookup,
  bodyweightSeries,
  commitWeightImport,
  deleteBodyweight,
  logBodyweight,
  logMeasurement,
  measurementSeries,
  previewWeightImport,
} from "..";
import { type JimDatabase, createTestDb } from "../../db/schema";
import { DEFAULT_SETTINGS } from "../../settings/defaults";

const USER_ID = "11111111-1111-1111-1111-111111111111";

const STRONG_WEIGHT = [
  "Date,Measurement Type,Value,Unit",
  "2024-01-15 07:05:12,Weight,180.4,lbs",
  "2024-01-16 07:01:00,Weight,179.8,lbs",
  "2024-01-16 07:01:00,Waist,32,in",
].join("\n");

let testDb: JimDatabase;

beforeEach(async () => {
  testDb = createTestDb(`jim-bodyweight-test-${crypto.randomUUID()}`);
  await testDb.settings.put({ ...DEFAULT_SETTINGS, units: "lb" });
});

afterEach(async () => {
  await testDb.delete();
});

describe("logBodyweight", () => {
  it("writes the weigh-in and its outbox entry together", async () => {
    const row = await logBodyweight(
      { userId: USER_ID, value: 180.456, unit: "lb", measuredAt: new Date(2024, 0, 15, 8) },
      testDb,
    );
    expect(row).toMatchObject({ kind: "bodyweight", value: "180.46", unit: "lb", deletedAt: null });
    expect(await testDb.bodyMeasurements.get(row.id)).toEqual(row);
    const outbox = await testDb.outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ table: "bodyMeasurements", entity: { id: row.id } });
  });

  it("updates the same day's weigh-in instead of adding a second", async () => {
    const first = await logBodyweight(
      { userId: USER_ID, value: 180, unit: "lb", measuredAt: new Date(2024, 0, 15, 8) },
      testDb,
    );
    const second = await logBodyweight(
      { userId: USER_ID, value: 179, unit: "lb", measuredAt: new Date(2024, 0, 15, 20) },
      testDb,
    );
    expect(second.id).toBe(first.id);
    expect(second.measuredAt).toEqual(first.measuredAt);
    const live = bodyweightSeries(await testDb.bodyMeasurements.toArray(), "lb");
    expect(live.map((point) => point.value)).toEqual([179]);
  });

  it("drops deleted weigh-ins from the series and converts units", async () => {
    const kept = await logBodyweight(
      { userId: USER_ID, value: 100, unit: "kg", measuredAt: new Date(2024, 0, 16) },
      testDb,
    );
    const removed = await logBodyweight(
      { userId: USER_ID, value: 180, unit: "lb", measuredAt: new Date(2024, 0, 15) },
      testDb,
    );
    await deleteBodyweight(removed, testDb);
    const series = bodyweightSeries(await testDb.bodyMeasurements.toArray(), "lb");
    expect(series).toEqual([{ id: kept.id, measuredAt: kept.measuredAt, value: 220.46 }]);
    expect(await testDb.outbox.count()).toBe(3);
  });
});

describe("weight import", () => {
  it("previews, imports, and skips everything on a second run", async () => {
    const preview = await previewWeightImport(STRONG_WEIGHT, testDb);
    expect(preview).toMatchObject({
      format: "strong",
      duplicateCount: 0,
      needsUnit: false,
      firstDate: new Date(2024, 0, 15, 7, 5, 12),
      lastDate: new Date(2024, 0, 16, 7, 1, 0),
    });
    expect(preview.entries).toHaveLength(2);

    const added = await commitWeightImport(
      { userId: USER_ID, entries: preview.entries, fileUnit: "kg" },
      testDb,
    );
    expect(added).toBe(2);
    expect(await testDb.outbox.count()).toBe(2);
    const series = bodyweightSeries(await testDb.bodyMeasurements.toArray(), "lb");
    expect(series.map((point) => point.value)).toEqual([180.4, 179.8]);

    const again = await previewWeightImport(STRONG_WEIGHT, testDb);
    expect(again.entries).toEqual([]);
    expect(again.duplicateCount).toBe(2);
    expect(
      await commitWeightImport(
        { userId: USER_ID, entries: preview.entries, fileUnit: "kg" },
        testDb,
      ),
    ).toBe(0);
  });

  it("applies the picked unit to unlabelled rows and still finds them on re-import", async () => {
    const file = "Date,Weight\n2024-01-15,82.5\n2024-01-16,82.1";
    const preview = await previewWeightImport(file, testDb);
    expect(preview.needsUnit).toBe(true);
    await commitWeightImport({ userId: USER_ID, entries: preview.entries, fileUnit: "kg" }, testDb);
    const rows = await testDb.bodyMeasurements.toArray();
    expect(rows.map((row) => row.unit)).toEqual(["kg", "kg"]);
    expect((await previewWeightImport(file, testDb)).duplicateCount).toBe(2);
  });
});

describe("body measurements (#249)", () => {
  it("logs each kind separately, one entry per kind a day, and converts lengths", async () => {
    const waist = await logMeasurement(
      { userId: USER_ID, kind: "waist", value: 32, unit: "in", measuredAt: new Date(2024, 0, 15) },
      testDb,
    );
    const again = await logMeasurement(
      {
        userId: USER_ID,
        kind: "waist",
        value: 32.5,
        unit: "in",
        measuredAt: new Date(2024, 0, 15, 20),
      },
      testDb,
    );
    expect(again.id).toBe(waist.id);
    await logMeasurement(
      { userId: USER_ID, kind: "arms", value: 38, unit: "cm", measuredAt: new Date(2024, 0, 15) },
      testDb,
    );
    await logBodyweight(
      { userId: USER_ID, value: 180, unit: "lb", measuredAt: new Date(2024, 0, 15) },
      testDb,
    );

    const rows = await testDb.bodyMeasurements.toArray();
    expect(measurementSeries(rows, "waist", "cm").map((p) => p.value)).toEqual([82.55]);
    expect(measurementSeries(rows, "arms", "in").map((p) => p.value)).toEqual([14.96]);
    // A length never shows up as a weight, nor the other way round.
    expect(measurementSeries(rows, "waist", "lb")).toEqual([]);
    expect(bodyweightSeries(rows, "lb").map((p) => p.value)).toEqual([180]);
    expect(await testDb.outbox.count()).toBe(4);
  });

  it("looks up the bodyweight that applied on a date", async () => {
    await logBodyweight(
      { userId: USER_ID, value: 200, unit: "lb", measuredAt: new Date(2024, 0, 1, 8) },
      testDb,
    );
    await logBodyweight(
      { userId: USER_ID, value: 90, unit: "kg", measuredAt: new Date(2024, 5, 1, 8) },
      testDb,
    );
    const at = bodyweightLookup(await testDb.bodyMeasurements.toArray(), "lb");
    expect(at(new Date(2023, 11, 1))).toBe(200); // before the first: the first
    expect(at(new Date(2024, 2, 1))).toBe(200);
    expect(at(new Date(2024, 5, 1, 6))).toBe(198.42); // same day counts
    expect(at(new Date(2025, 0, 1))).toBe(198.42);
    expect(bodyweightLookup([], "lb")(new Date())).toBeNull();
  });
});
