import type { BodyMeasurementRow } from "@/lib/db/schema";
import { parseWeightCsv } from "@jim/core";
import { describe, expect, it } from "vitest";
import { bodyweightCsvFromTables, exportFileName } from "../export-build";

const row = (overrides: Partial<BodyMeasurementRow>) =>
  ({
    id: "m",
    kind: "bodyweight",
    value: "180.40",
    unit: "lb",
    measuredAt: new Date(2026, 9, 2, 7, 30),
    deletedAt: null,
    ...overrides,
  }) as BodyMeasurementRow;

describe("bodyweightCsvFromTables", () => {
  it("writes live weigh-ins oldest first, in their own unit, readable by the import", () => {
    const csv = bodyweightCsvFromTables({
      bodyMeasurements: [
        row({ id: "b", measuredAt: new Date(2026, 9, 5, 7, 0), value: "81.50", unit: "kg" }),
        row({ id: "a" }),
        row({ id: "waist", kind: "waist", value: "32.00", unit: "in" }),
        row({ id: "gone", deletedAt: new Date() }),
      ],
    });
    expect(parseWeightCsv(csv).entries).toEqual([
      { measuredAt: new Date(2026, 9, 2, 7, 30), value: 180.4, unit: "lb" },
      { measuredAt: new Date(2026, 9, 5, 7, 0), value: 81.5, unit: "kg" },
    ]);
  });
});

describe("exportFileName", () => {
  it("dates the file, with an optional name", () => {
    const now = new Date(2026, 9, 2);
    expect(exportFileName("json", now)).toBe("jim-export-2026-10-02.json");
    expect(exportFileName("csv", now, "bodyweight")).toBe("jim-bodyweight-2026-10-02.csv");
  });
});
