import { describe, expect, it } from "vitest";
import {
  AppleHealthWeightScanner,
  parseAppleHealthWeights,
  parseHealthDate,
} from "../apple-health";
import { WorkoutCsvError } from "../workout-csv";

function record(type: string, value: string, unit: string, startDate: string, extra = ""): string {
  return ` <Record type="${type}" sourceName="Withings &gt; Health" sourceVersion="6.1" unit="${unit}" creationDate="${startDate}" startDate="${startDate}" endDate="${startDate}" value="${value}"${extra}>\n  <MetadataEntry key="HKWasUserEntered" value="1"/>\n </Record>\n`;
}

const BODY_MASS = "HKQuantityTypeIdentifierBodyMass";

function healthExport(records: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData [
<!ATTLIST Record type CDATA #REQUIRED>
]>
<HealthData locale="en_US">
 <ExportDate value="2026-10-01 08:00:00 -0700"/>
 <Me HKCharacteristicTypeIdentifierBiologicalSex="HKBiologicalSexMale"/>
${records.join("")}
</HealthData>
`;
}

describe("parseHealthDate", () => {
  it("reads Health's offset dates as instants", () => {
    expect(parseHealthDate("2024-01-05 07:12:33 -0500")?.toISOString()).toBe(
      "2024-01-05T12:12:33.000Z",
    );
    expect(parseHealthDate("2024-01-05 07:12:33 +0530")?.toISOString()).toBe(
      "2024-01-05T01:42:33.000Z",
    );
    expect(parseHealthDate("yesterday")).toBeNull();
  });
});

describe("parseAppleHealthWeights", () => {
  it("keeps bodyweight records and ignores other types", () => {
    const parsed = parseAppleHealthWeights(
      healthExport([
        record(BODY_MASS, "81.5", "kg", "2024-01-05 07:12:33 +0000"),
        record(
          "HKQuantityTypeIdentifierBodyMassIndex",
          "24.1",
          "count",
          "2024-01-05 07:12:33 +0000",
        ),
        record("HKQuantityTypeIdentifierLeanBodyMass", "65", "kg", "2024-01-05 07:12:33 +0000"),
        record("HKQuantityTypeIdentifierStepCount", "512", "count", "2024-01-05 09:00:00 +0000"),
        record(BODY_MASS, "180.2", "lb", "2024-01-08 07:00:00 +0000"),
      ]),
    );
    expect(parsed.format).toBe("apple-health");
    expect(parsed.entries).toEqual([
      { measuredAt: new Date("2024-01-05T07:12:33Z"), value: 81.5, unit: "kg" },
      { measuredAt: new Date("2024-01-08T07:00:00Z"), value: 180.2, unit: "lb" },
    ]);
  });

  it("converts grams and stone", () => {
    const parsed = parseAppleHealthWeights(
      healthExport([
        record(BODY_MASS, "81500", "g", "2024-01-05 12:00:00 +0000"),
        record(BODY_MASS, "12.5", "st", "2024-01-08 12:00:00 +0000"),
      ]),
    );
    expect(parsed.entries.map((e) => [e.value, e.unit])).toEqual([
      [81.5, "kg"],
      [175, "lb"],
    ]);
  });

  it("keeps the last weigh-in of each day, wherever it sits in the file", () => {
    const parsed = parseAppleHealthWeights(
      healthExport([
        record(BODY_MASS, "82", "kg", "2024-01-05 12:30:00 +0000"),
        record(BODY_MASS, "81", "kg", "2024-01-05 12:10:00 +0000"),
        record(BODY_MASS, "80", "kg", "2024-01-06 12:00:00 +0000"),
      ]),
    );
    expect(parsed.entries.map((e) => e.value)).toEqual([82, 80]);
    expect(parsed.sameDayRows).toBe(1);
  });

  it("skips unreadable and implausible records", () => {
    const parsed = parseAppleHealthWeights(
      healthExport([
        record(BODY_MASS, "81", "kg", "2024-01-05 12:00:00 +0000"),
        record(BODY_MASS, "0.5", "kg", "2024-01-06 12:00:00 +0000"),
        record(BODY_MASS, "81", "furlongs", "2024-01-07 12:00:00 +0000"),
        record(BODY_MASS, "81", "kg", "not a date"),
      ]),
    );
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.skippedRows).toBe(3);
  });

  it("explains a Health export with no bodyweight, and a file that isn't one", () => {
    expect(() =>
      parseAppleHealthWeights(
        healthExport([
          record("HKQuantityTypeIdentifierStepCount", "5", "count", "2024-01-05 09:00:00 +0000"),
        ]),
      ),
    ).toThrow(/no bodyweight/);
    expect(() => parseAppleHealthWeights("Date,Weight\n2024-01-01,80")).toThrow(WorkoutCsvError);
  });
});

describe("AppleHealthWeightScanner", () => {
  it("finds every record however the file is chunked", () => {
    const records = Array.from({ length: 50 }, (_, i) => {
      const day = String((i % 28) + 1).padStart(2, "0");
      const month = String(Math.floor(i / 28) + 1).padStart(2, "0");
      return record(BODY_MASS, String(80 + i / 10), "kg", `2024-${month}-${day} 08:00:00 +0000`);
    });
    // Filler records between, so the scanner has to drop text as it goes.
    const filler = record(
      "HKQuantityTypeIdentifierStepCount",
      "512",
      "count",
      "2024-01-01 09:00:00 +0000",
    );
    const text = healthExport(records.flatMap((r) => [r, filler.repeat(20)]));
    const whole = parseAppleHealthWeights(text);
    expect(whole.entries).toHaveLength(50);

    for (const size of [1, 7, 33, 1000, 65536]) {
      const scanner = new AppleHealthWeightScanner();
      for (let i = 0; i < text.length; i += size) scanner.push(text.slice(i, i + size));
      expect(scanner.finish().entries).toEqual(whole.entries);
    }
  });
});
