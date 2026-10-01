import { describe, expect, it } from "vitest";
import { parseWeightCsv, parseWeightUnit, weightEntryKey } from "../weight-csv";
import { WorkoutCsvError } from "../workout-csv";

const STRONG_WEIGHT = [
  "Date,Measurement Type,Value,Unit,Source",
  "2024-01-15 07:05:12,Weight,180.4,lbs,Strong",
  "2024-01-16 07:01:00,Weight,179.8,lbs,Strong",
  "2024-01-16 07:01:00,Waist,32,in,Strong",
  "2024-01-14 06:59:00,Body Weight,181,lbs,Apple Health",
].join("\n");

describe("parseWeightCsv", () => {
  it("reads Strong's measurements export, keeping only bodyweight, oldest first", () => {
    const parsed = parseWeightCsv(STRONG_WEIGHT);
    expect(parsed.format).toBe("strong");
    expect(parsed.entries).toEqual([
      { measuredAt: new Date(2024, 0, 14, 6, 59, 0), value: 181, unit: "lb" },
      { measuredAt: new Date(2024, 0, 15, 7, 5, 12), value: 180.4, unit: "lb" },
      { measuredAt: new Date(2024, 0, 16, 7, 1, 0), value: 179.8, unit: "lb" },
    ]);
    expect(parsed.skippedRows).toBe(0);
  });

  it("takes the unit from the header and reads a semicolon file's decimal commas", () => {
    const parsed = parseWeightCsv(
      ["Date;Weight (kg);Body fat (%)", "15.01.2024;81,5;18", "16.01.2024;81,2;18"].join("\n"),
    );
    expect(parsed.format).toBe("csv");
    expect(parsed.entries).toEqual([
      { measuredAt: new Date(2024, 0, 15, 12), value: 81.5, unit: "kg" },
      { measuredAt: new Date(2024, 0, 16, 12), value: 81.2, unit: "kg" },
    ]);
  });

  it("leaves the unit unknown when the file doesn't say, and reads units inside cells", () => {
    const parsed = parseWeightCsv(["date,weight", "2024-01-15,180", "2024-01-16,82 kg"].join("\n"));
    expect(parsed.entries.map((entry) => entry.unit)).toEqual([null, "kg"]);
  });

  it("sniffs day-first slashed dates from the whole column", () => {
    const parsed = parseWeightCsv(["Date,Weight", "03/04/2024,80", "25/04/2024,79"].join("\n"));
    expect(parsed.entries.map((entry) => entry.measuredAt)).toEqual([
      new Date(2024, 3, 3, 12),
      new Date(2024, 3, 25, 12),
    ]);
    const monthFirst = parseWeightCsv(["Date,Weight", "03/04/2024,80", "04/25/2024,79"].join("\n"));
    expect(monthFirst.entries[0]?.measuredAt).toEqual(new Date(2024, 2, 4, 12));
  });

  it("reads named months, 12-hour times and ISO instants", () => {
    const parsed = parseWeightCsv(
      [
        "Timestamp,Body Mass (lb)",
        '"Jan 15, 2024 7:05 PM",180',
        "16 Jan 2024,179",
        "2024-01-17T08:00:00Z,178",
      ].join("\n"),
    );
    expect(parsed.entries.map((entry) => entry.measuredAt)).toEqual([
      new Date(2024, 0, 15, 19, 5),
      new Date(2024, 0, 16, 12),
      new Date("2024-01-17T08:00:00Z"),
    ]);
    expect(parsed.entries.every((entry) => entry.unit === "lb")).toBe(true);
  });

  it("skips unreadable rows and repeats instead of failing the file", () => {
    const parsed = parseWeightCsv(
      [
        "Date,Weight",
        "2024-01-15,180",
        "2024-01-15,180",
        "not a date,180",
        "2024-02-31,180",
        "2024-01-16,",
        "2024-01-17,0",
      ].join("\n"),
    );
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.skippedRows).toBe(4);
  });

  it("explains files it can't import", () => {
    expect(() => parseWeightCsv("Date,Notes\n2024-01-15,hi")).toThrow(WorkoutCsvError);
    expect(() =>
      parseWeightCsv(
        "Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps\n2024-01-15 07:00:00,A,1h,Bench,1,100,5",
      ),
    ).toThrow(/workout export/);
    expect(() =>
      parseWeightCsv("Date,Measurement Type,Value,Unit\n2024-01-15 07:00:00,Waist,32,in"),
    ).toThrow(/no bodyweight/);
    expect(() => parseWeightCsv("Date,Weight\n")).toThrow(WorkoutCsvError);
  });
});

describe("parseWeightUnit", () => {
  it("knows the common spellings", () => {
    expect(parseWeightUnit("KGS")).toBe("kg");
    expect(parseWeightUnit("pounds")).toBe("lb");
    expect(parseWeightUnit("in")).toBeNull();
  });
});

describe("weightEntryKey", () => {
  it("matches the same weigh-in in either unit", () => {
    const at = new Date(2024, 0, 15, 7, 5, 12);
    expect(weightEntryKey(at, 100, "kg")).toBe(weightEntryKey(at, 220.46, "lb"));
    expect(weightEntryKey(at, 100, "kg")).not.toBe(weightEntryKey(at, 101, "kg"));
  });
});
