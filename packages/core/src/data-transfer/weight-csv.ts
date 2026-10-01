import { parseCsv } from "./csv";
import { type WeightUnit, WorkoutCsvError, convertWeight } from "./workout-csv";

/**
 * Bodyweight history in from a CSV (issue #377). Strong exports
 * measurements separately from workouts, one file per metric
 * (`strong_weight.csv`: Date, Measurement Type, Value, Unit). The parser is
 * deliberately forgiving beyond that: any file with a date column and a
 * weight column imports, so a scale app's or a spreadsheet's export works
 * too. Rows it can't read are counted, not fatal.
 */

export interface ImportedWeight {
  measuredAt: Date;
  value: number;
  /** The unit `value` is in, when the file says so; null means ask the user. */
  unit: WeightUnit | null;
}

export type WeightCsvFormat = "strong" | "csv";

export interface ParsedWeightCsv {
  format: WeightCsvFormat;
  entries: ImportedWeight[];
  /** Data rows that had no readable date or weight. */
  skippedRows: number;
}

const DATE_COLUMNS = ["date", "datetime", "date/time", "date time", "timestamp", "time", "day"];
const VALUE_COLUMNS = ["value", "weight", "body weight", "bodyweight", "body mass", "mass"];
const TYPE_COLUMNS = ["measurement type", "measurement", "type", "metric", "name", "kind"];
const UNIT_COLUMNS = ["unit", "units", "weight unit"];

/** "Weight (kg)", "Body Weight [lbs]" → the label and the unit in brackets. */
function splitHeader(cell: string): { label: string; unit: WeightUnit | null } {
  const lower = cell.trim().toLowerCase();
  const match = /^(.*?)\s*[([]\s*([a-z]+)\s*[)\]]\s*$/.exec(lower);
  if (!match) return { label: lower, unit: null };
  return { label: (match[1] ?? "").trim(), unit: parseWeightUnit(match[2] ?? "") };
}

export function parseWeightUnit(value: string): WeightUnit | null {
  const unit = value.trim().toLowerCase().replace(/\.$/, "");
  if (unit === "kg" || unit === "kgs" || unit === "kilograms" || unit === "kilogram") return "kg";
  if (["lb", "lbs", "pound", "pounds", "#"].includes(unit)) return "lb";
  return null;
}

/** Whether a measurement-type cell names bodyweight (not waist, body fat, …). */
function isBodyweightType(value: string): boolean {
  const type = value.trim().toLowerCase().replace(/[_-]/g, " ");
  if (type === "") return true;
  if (/fat|lean|muscle|bmi|water|bone|waist|chest|arm|thigh|hip|neck|calf|calories/.test(type)) {
    return false;
  }
  return /weight|mass/.test(type);
}

/** "81,5 kg" → 81.5 and "kg"; a decimal comma reads as a point. */
function parseWeightCell(raw: string): { value: number | null; unit: WeightUnit | null } {
  const match = /^\s*(-?[\d.,\s]*\d)\s*([a-z#.]*)\s*$/i.exec(raw);
  if (!match) return { value: null, unit: null };
  let digits = (match[1] ?? "").replace(/\s/g, "");
  if (digits.includes(",") && digits.includes(".")) {
    // "1,234.5" (thousands commas) or "1.234,5" (thousands points)
    digits =
      digits.lastIndexOf(",") > digits.lastIndexOf(".")
        ? digits.replace(/\./g, "").replace(",", ".")
        : digits.replace(/,/g, "");
  } else {
    digits = digits.replace(",", ".");
  }
  const value = Number(digits);
  return {
    value: Number.isFinite(value) && value > 0 ? value : null,
    unit: parseWeightUnit(match[2] ?? ""),
  };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

interface TimeParts {
  h: number;
  mi: number;
  s: number;
}

function timeOf(rest: string): TimeParts | null {
  const match = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?/i.exec(rest);
  if (!match) return { h: 12, mi: 0, s: 0 };
  let h = Number(match[1]);
  const meridiem = match[4]?.toLowerCase().replace(/\./g, "");
  if (meridiem === "pm" && h < 12) h += 12;
  if (meridiem === "am" && h === 12) h = 0;
  if (h > 23) return null;
  return { h, mi: Number(match[2]), s: Number(match[3] ?? 0) };
}

/**
 * A row's local date and time. A value with no time reads as noon, so a
 * date-only file never lands on the previous day in a timezone west of UTC.
 * `dayFirst` decides "03/04/2024": the caller sniffs it from the whole file.
 */
function parseWeightDate(raw: string, dayFirst: boolean): Date | null {
  const value = raw.trim();
  if (!value) return null;

  // An explicit offset or Z is an instant; let the platform read it.
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  let y: number;
  let mo: number;
  let d: number;
  let rest: string;

  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(.*)$/.exec(value);
  const slashed = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(.*)$/.exec(value);
  const dayName = /^(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4}),?(.*)$/.exec(value);
  const monthName = /^([A-Za-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4}),?(.*)$/.exec(value);
  if (iso) {
    y = Number(iso[1]);
    mo = Number(iso[2]);
    d = Number(iso[3]);
    rest = iso[4] ?? "";
  } else if (slashed) {
    const a = Number(slashed[1]);
    const b = Number(slashed[2]);
    d = dayFirst ? a : b;
    mo = dayFirst ? b : a;
    y = Number(slashed[3]);
    if (y < 100) y += 2000;
    rest = slashed[4] ?? "";
  } else if (dayName || monthName) {
    const match = (dayName ?? monthName) as RegExpExecArray;
    const monthText = (dayName ? match[2] : match[1]) ?? "";
    mo = MONTHS.indexOf(monthText.slice(0, 3).toLowerCase()) + 1;
    d = Number(dayName ? match[1] : match[2]);
    y = Number(match[3]);
    rest = match[4] ?? "";
  } else {
    return null;
  }

  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const time = timeOf(rest.replace(/^T/i, " "));
  if (!time) return null;
  const date = new Date(y, mo - 1, d, time.h, time.mi, time.s);
  // Rejects Feb 31 and friends, which Date would roll into the next month.
  return date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}

/** Whether "a/b/yyyy" dates in this column are day-first: any first part over 12 says so. */
function sniffDayFirst(values: readonly string[]): boolean {
  let dayFirst = false;
  for (const value of values) {
    const match = /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/.exec(value.trim());
    if (!match) continue;
    if (Number(match[1]) > 12) dayFirst = true;
    if (Number(match[2]) > 12) return false;
  }
  return dayFirst;
}

function findColumn(labels: readonly string[], names: readonly string[]): number {
  for (const name of names) {
    const index = labels.indexOf(name);
    if (index !== -1) return index;
  }
  return -1;
}

export function parseWeightCsv(text: string): ParsedWeightCsv {
  const rows = parseCsv(text);
  const [header, ...data] = rows;
  if (!header || data.length === 0) {
    throw new WorkoutCsvError("That file has no rows to import.");
  }

  const headers = header.map(splitHeader);
  const labels = headers.map((h) => h.label);

  if (labels.includes("exercise name") || labels.includes("exercise_title")) {
    throw new WorkoutCsvError(
      "That's a workout export. Import it from Settings → Your data instead.",
    );
  }

  let dateIndex = findColumn(labels, DATE_COLUMNS);
  if (dateIndex === -1) dateIndex = labels.findIndex((label) => /date|time/.test(label));
  let valueIndex = findColumn(labels, VALUE_COLUMNS);
  if (valueIndex === -1) valueIndex = labels.findIndex((label) => /weight|mass/.test(label));
  const typeIndex = findColumn(labels, TYPE_COLUMNS);
  const unitIndex = findColumn(labels, UNIT_COLUMNS);

  if (dateIndex === -1 || valueIndex === -1 || dateIndex === valueIndex) {
    throw new WorkoutCsvError(
      "Couldn't find a date and a weight column in that file. Export your weight from Strong (Settings → Export measurements) and try again.",
    );
  }

  const headerUnit = headers[valueIndex]?.unit ?? null;
  const cell = (row: readonly string[], index: number) =>
    index === -1 ? "" : (row[index] ?? "").trim();
  const dayFirst = sniffDayFirst(data.map((row) => cell(row, dateIndex)));

  const entries: ImportedWeight[] = [];
  const seen = new Set<string>();
  let skippedRows = 0;
  let otherMeasurements = 0;

  for (const row of data) {
    if (typeIndex !== -1 && !isBodyweightType(cell(row, typeIndex))) {
      otherMeasurements++;
      continue;
    }
    const measuredAt = parseWeightDate(cell(row, dateIndex), dayFirst);
    const parsed = parseWeightCell(cell(row, valueIndex));
    if (!measuredAt || parsed.value == null) {
      skippedRows++;
      continue;
    }
    const unit = parseWeightUnit(cell(row, unitIndex)) ?? parsed.unit ?? headerUnit;
    const key = weightEntryKey(measuredAt, parsed.value, unit ?? "kg");
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ measuredAt, value: parsed.value, unit });
  }

  if (entries.length === 0) {
    throw new WorkoutCsvError(
      otherMeasurements > 0
        ? "That file has measurements, but no bodyweight. Export Strong's Weight measurement."
        : "Couldn't read any weights from that file.",
    );
  }

  entries.sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());
  return {
    format: typeIndex !== -1 || labels.includes("measurement") ? "strong" : "csv",
    entries,
    skippedRows,
  };
}

/**
 * An entry's identity for duplicate detection: its time to the minute and
 * its weight in kg to the tenth, so re-importing a file (in either unit)
 * matches what the first import wrote.
 */
export function weightEntryKey(measuredAt: Date, value: number, unit: WeightUnit): string {
  const minute = Math.floor(measuredAt.getTime() / 60_000);
  const kg = Math.round(convertWeight(value, unit, "kg") * 10) / 10;
  return `${minute}:${kg.toFixed(1)}`;
}
