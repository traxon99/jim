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

export type WeightCsvFormat = "strong" | "csv" | "notes";

export interface ParsedWeightCsv {
  format: WeightCsvFormat;
  entries: ImportedWeight[];
  /** Data rows that had no readable date or weight. */
  skippedRows: number;
  /** Earlier entries dropped because a later line logged the same day (notes only). */
  sameDayRows: number;
  /** Weights dropped as likely typos: far off from the weigh-ins around them (notes only). */
  outlierRows: number;
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

/**
 * A date at the start of a line: "6/26/26", "2026-06-26", "26.06.2026".
 * Leading bullets or checkboxes from a notes app are allowed before it.
 */
const NOTE_DATE =
  /^[\s*•·\-–—>[\]x]*?(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i;

/**
 * "6/26/26 - 153.1", "7/27/26. 145.5", "7/5/26 148.7 lb": the date, any run
 * of separators, then the weight. Anything after the weight is a comment.
 */
const NOTE_LINE = new RegExp(
  `${NOTE_DATE.source}(?![\\d])[\\s\\-–—:.,;=|>~]*(\\d+(?:[.,]\\d+)?)\\s*([a-z#]+\\.?)?`,
  "i",
);

/** Whether the text is a hand-typed list (no header row, a date on the first line). */
function looksLikeNotes(text: string): boolean {
  const first = text.split(/\r?\n/).find((line) => line.trim() !== "");
  return first != null && NOTE_DATE.test(first);
}

/** Plausible bodyweights in either unit; anything outside is a typo, not a weigh-in. */
const MIN_WEIGHT = 20;
const MAX_WEIGHT = 1000;
/** A weigh-in this far (as a fraction) from the ones around it is a typo. */
const OUTLIER_SPREAD = 0.25;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/**
 * Drops entries far off from the weigh-ins around them: each is checked
 * against the median of a five-entry window centered on it, so one typo
 * can't drag the yardstick its neighbors are judged by.
 */
function dropOutliers(entries: readonly ImportedWeight[]): ImportedWeight[] {
  // Mixed units can't be compared; leave those to the user.
  if (new Set(entries.map((entry) => entry.unit)).size > 1) return [...entries];
  return entries.filter((entry, i) => {
    const window = entries.slice(Math.max(0, i - 2), i + 3).map((other) => other.value);
    if (window.length < 3) return true;
    const typical = median(window);
    return Math.abs(entry.value - typical) / typical <= OUTLIER_SPREAD;
  });
}

/**
 * A weight log typed into a notes app, one weigh-in per line. Cleans as it
 * goes: separators between date and weight vary line to line, blank and
 * unreadable lines are skipped, two lines for one day keep the later one
 * (the correction), and a weight far off from its neighbors is dropped as a
 * typo.
 */
function parseWeightNotes(text: string): ParsedWeightCsv {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const dayFirst = sniffDayFirst(lines.map((line) => NOTE_DATE.exec(line)?.[1] ?? ""));

  const byDay = new Map<string, ImportedWeight>();
  let skippedRows = 0;
  let sameDayRows = 0;
  for (const line of lines) {
    const match = NOTE_LINE.exec(line);
    const measuredAt = match ? parseWeightDate(match[1] ?? "", dayFirst) : null;
    const value = match ? Number((match[2] ?? "").replace(",", ".")) : Number.NaN;
    if (!measuredAt || !Number.isFinite(value) || value < MIN_WEIGHT || value > MAX_WEIGHT) {
      skippedRows++;
      continue;
    }
    const day = `${measuredAt.getFullYear()}-${measuredAt.getMonth()}-${measuredAt.getDate()}`;
    if (byDay.has(day)) {
      sameDayRows++;
      byDay.delete(day);
    }
    byDay.set(day, { measuredAt, value, unit: parseWeightUnit(match?.[3] ?? "") });
  }

  const sorted = [...byDay.values()].sort(
    (a, b) => a.measuredAt.getTime() - b.measuredAt.getTime(),
  );
  const entries = dropOutliers(sorted);
  if (entries.length === 0) {
    throw new WorkoutCsvError(
      "Couldn't read any weights. Put one weigh-in per line, like 6/26/26 - 153.1.",
    );
  }
  return {
    format: "notes",
    entries,
    skippedRows,
    sameDayRows,
    outlierRows: sorted.length - entries.length,
  };
}

export function parseWeightCsv(text: string): ParsedWeightCsv {
  if (looksLikeNotes(text)) return parseWeightNotes(text);
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
    sameDayRows: 0,
    outlierRows: 0,
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
