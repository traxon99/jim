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

describe("parseWeightCsv: a weight log pasted from notes", () => {
  // Jackson's notes, as typed: mixed separators and a second line for 9/10.
  const NOTES = [
    "6/26/26 - 153.1",
    "6/29/26 - 149.7",
    "7/2/26 - 150.3",
    "7/5/26 148.7",
    "7/27/26. 145.5",
    "",
    "9/10/26 130.2",
    "9/10/26 128.8",
    "9/18/26 127.9",
    "9/23/26 126.4",
  ].join("\n");

  it("reads one weigh-in per line whatever sits between the date and the weight", () => {
    const parsed = parseWeightCsv(NOTES);
    expect(parsed.format).toBe("notes");
    expect(parsed.entries[0]).toEqual({
      measuredAt: new Date(2026, 5, 26, 12),
      value: 153.1,
      unit: null,
    });
    expect(
      parsed.entries.find((e) => e.measuredAt.getMonth() === 6 && e.measuredAt.getDate() === 27)
        ?.value,
    ).toBe(145.5);
    expect(parsed.skippedRows).toBe(0);
  });

  it("keeps the later line when a day is logged twice", () => {
    const parsed = parseWeightCsv(NOTES);
    const sept10 = parsed.entries.filter(
      (e) => e.measuredAt.getMonth() === 8 && e.measuredAt.getDate() === 10,
    );
    expect(sept10.map((e) => e.value)).toEqual([128.8]);
    expect(parsed.sameDayRows).toBe(1);
    expect(parsed.entries).toHaveLength(8);
  });

  it("sorts out-of-order lines and reads bullets, ISO dates and units", () => {
    const parsed = parseWeightCsv(
      ["• 2026-07-02: 68.2 kg", "- 2026-07-01 = 68.5kg", "2026-07-03 68 kg (after run)"].join("\n"),
    );
    expect(parsed.entries.map((e) => [e.measuredAt.getDate(), e.value, e.unit])).toEqual([
      [1, 68.5, "kg"],
      [2, 68.2, "kg"],
      [3, 68, "kg"],
    ]);
  });

  it("skips unreadable lines and drops typos far from their neighbors", () => {
    const parsed = parseWeightCsv(
      [
        "8/7/26 141.3",
        "8/8/26 140.6",
        "8/9/26 1394",
        "8/10/26 241.0",
        "8/11/26 139.1",
        "8/12/26 138.9",
        "weigh in before breakfast",
        "8/13/26",
      ].join("\n"),
    );
    expect(parsed.entries.map((e) => e.value)).toEqual([141.3, 140.6, 139.1, 138.9]);
    expect(parsed.outlierRows).toBe(1);
    expect(parsed.skippedRows).toBe(3);
  });

  it("explains the expected shape when nothing reads", () => {
    expect(() => parseWeightCsv("6/26/26 nope")).toThrow(/one weigh-in per line/);
  });
});
