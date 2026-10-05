import { mutate } from "@/lib/db/mutate";
import { type BodyMeasurementRow, type JimDatabase, type OutboxEntry, db } from "@/lib/db/schema";
import { getCachedSettings, patchSettings } from "@/lib/settings";
import { getDeviceId } from "@/lib/sync/engine";
import {
  type ImportedWeight,
  type MeasurementKind,
  type MeasurementUnit,
  type WeightCsvFormat,
  type WeightUnit,
  bodyweightOn,
  convertMeasurement,
  parseWeightCsv,
  uuidv7,
  weightEntryKey,
} from "@jim/core";

/**
 * Bodyweight over time (issue #377), and body measurements alongside it
 * (issue #249). Each entry is a `body_measurements` row (kind "bodyweight",
 * "waist", …), written through the outbox like everything else the phone
 * logs, so it syncs. Rows keep the unit they were entered in; readers
 * convert to the user's current units.
 */

const BODYWEIGHT_KIND = "bodyweight";

export interface BodyweightPoint {
  id: string;
  measuredAt: Date;
  /** In the units asked for, to two decimals. */
  value: number;
}

/** A point on any measurement's trend (issue #249); same shape as a weigh-in. */
export type MeasurementPoint = BodyweightPoint;

function isLive(row: BodyMeasurementRow, kind: MeasurementKind): boolean {
  return row.kind === kind && !row.deletedAt;
}

function isLiveBodyweight(
  row: BodyMeasurementRow,
): row is BodyMeasurementRow & { unit: WeightUnit } {
  return isLive(row, BODYWEIGHT_KIND) && (row.unit === "lb" || row.unit === "kg");
}

/**
 * Live entries of one kind in `unit`, oldest first. Rows whose unit can't
 * convert to it (a length logged against a weight kind) are left out.
 */
export function measurementSeries(
  rows: readonly BodyMeasurementRow[],
  kind: MeasurementKind,
  unit: MeasurementUnit,
): MeasurementPoint[] {
  const points: MeasurementPoint[] = [];
  for (const row of rows) {
    if (!isLive(row, kind)) continue;
    const value = convertMeasurement(Number(row.value), row.unit, unit);
    if (value == null || !Number.isFinite(value)) continue;
    points.push({ id: row.id, measuredAt: row.measuredAt, value });
  }
  return points.sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());
}

/** Live weigh-ins in `units`, oldest first. */
export function bodyweightSeries(
  rows: readonly BodyMeasurementRow[],
  units: WeightUnit,
): BodyweightPoint[] {
  return measurementSeries(rows, BODYWEIGHT_KIND, units);
}

/**
 * Looks up the bodyweight (in `units`) that applied on a date, so a past PR
 * is judged against what the user weighed then rather than today (issue
 * #249). Null with no weigh-ins; callers fall back to Settings' value.
 */
export function bodyweightLookup(
  rows: readonly BodyMeasurementRow[],
  units: WeightUnit,
): (date: Date) => number | null {
  const series = bodyweightSeries(rows, units);
  return (date) => bodyweightOn(series, date);
}

/** `numeric(7, 2)` on the server: round here so the local row matches what syncs back. */
function toStoredValue(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Logs one measurement. A day holds one entry per kind: logging again on a
 * day that already has one updates it instead of stacking a second point.
 */
export async function logMeasurement(
  input: {
    userId: string;
    kind: MeasurementKind;
    value: number;
    unit: MeasurementUnit;
    measuredAt: Date;
  },
  database: JimDatabase = db,
): Promise<BodyMeasurementRow> {
  const deviceId = await getDeviceId(database);
  const now = new Date();
  const rows = await database.bodyMeasurements.toArray();
  const sameDay = rows.find(
    (row) => isLive(row, input.kind) && sameLocalDay(row.measuredAt, input.measuredAt),
  );
  const entity: BodyMeasurementRow = {
    id: sameDay?.id ?? uuidv7(),
    userId: input.userId,
    kind: input.kind,
    value: toStoredValue(input.value),
    unit: input.unit,
    measuredAt: sameDay?.measuredAt ?? input.measuredAt,
    updatedAt: now,
    deviceId,
    deletedAt: null,
    serverSeq: sameDay?.serverSeq ?? 0,
  };
  await mutate("bodyMeasurements", entity, database);
  return entity;
}

/** Logs a weigh-in; see `logMeasurement`. */
export function logBodyweight(
  input: { userId: string; value: number; unit: WeightUnit; measuredAt: Date },
  database: JimDatabase = db,
): Promise<BodyMeasurementRow> {
  return logMeasurement({ ...input, kind: BODYWEIGHT_KIND }, database);
}

/** Tombstones any measurement row, weigh-ins included. */
export async function deleteMeasurement(
  row: BodyMeasurementRow,
  database: JimDatabase = db,
): Promise<void> {
  const now = new Date();
  await mutate(
    "bodyMeasurements",
    { ...row, deletedAt: now, updatedAt: now, deviceId: await getDeviceId(database) },
    database,
  );
}

export const deleteBodyweight = deleteMeasurement;

/**
 * Keeps Settings' single "current bodyweight" (what strength standards
 * read) in step with the latest weigh-in. Best-effort: offline, the history
 * is still saved and the next change catches the profile up.
 */
export async function syncCurrentBodyweight(database: JimDatabase = db): Promise<void> {
  const settings = await getCachedSettings(database);
  const series = bodyweightSeries(await database.bodyMeasurements.toArray(), settings.units);
  const latest = series[series.length - 1];
  if (!latest) return;
  const value = String(Math.round(latest.value * 10) / 10);
  if (settings.bodyweight != null && Number(settings.bodyweight) === Number(value)) return;
  await patchSettings({ bodyweight: value }, database);
}

export interface WeightImportPreview {
  format: WeightCsvFormat;
  /** New entries only; ones already in Jim are dropped. */
  entries: ImportedWeight[];
  duplicateCount: number;
  skippedRows: number;
  /** Cleaned out of pasted notes: repeat lines for a day, and likely typos. */
  sameDayRows: number;
  outlierRows: number;
  /** Whether any entry has no unit in the file, so the user must pick one. */
  needsUnit: boolean;
  firstDate: Date | null;
  lastDate: Date | null;
}

async function existingKeys(database: JimDatabase): Promise<Set<string>> {
  const rows = await database.bodyMeasurements.toArray();
  return new Set(
    rows
      .filter(isLiveBodyweight)
      .map((row) => weightEntryKey(row.measuredAt, Number(row.value), row.unit)),
  );
}

export async function previewWeightImport(
  text: string,
  database: JimDatabase = db,
): Promise<WeightImportPreview> {
  const parsed = parseWeightCsv(text);
  const existing = await existingKeys(database);
  // Unlabelled rows can't be keyed until the user picks a unit, so check
  // both: a re-import of an unlabelled file still finds its duplicates.
  const isDuplicate = (entry: ImportedWeight) =>
    entry.unit
      ? existing.has(weightEntryKey(entry.measuredAt, entry.value, entry.unit))
      : existing.has(weightEntryKey(entry.measuredAt, entry.value, "kg")) ||
        existing.has(weightEntryKey(entry.measuredAt, entry.value, "lb"));
  const entries = parsed.entries.filter((entry) => !isDuplicate(entry));
  return {
    format: parsed.format,
    entries,
    duplicateCount: parsed.entries.length - entries.length,
    skippedRows: parsed.skippedRows,
    sameDayRows: parsed.sameDayRows,
    outlierRows: parsed.outlierRows,
    needsUnit: entries.some((entry) => entry.unit == null),
    firstDate: entries[0]?.measuredAt ?? null,
    lastDate: entries[entries.length - 1]?.measuredAt ?? null,
  };
}

/** Writes imported weigh-ins in one transaction; returns how many were added. */
export async function commitWeightImport(
  input: { userId: string; entries: readonly ImportedWeight[]; fileUnit: WeightUnit },
  database: JimDatabase = db,
): Promise<number> {
  const deviceId = await getDeviceId(database);
  const existing = await existingKeys(database);
  const now = new Date();
  const rows: BodyMeasurementRow[] = [];
  for (const entry of input.entries) {
    const unit = entry.unit ?? input.fileUnit;
    const key = weightEntryKey(entry.measuredAt, entry.value, unit);
    if (existing.has(key)) continue;
    existing.add(key);
    rows.push({
      id: uuidv7(entry.measuredAt.getTime()),
      userId: input.userId,
      kind: BODYWEIGHT_KIND,
      value: toStoredValue(entry.value),
      unit,
      measuredAt: entry.measuredAt,
      updatedAt: now,
      deviceId,
      deletedAt: null,
      serverSeq: 0,
    });
  }
  if (rows.length === 0) return 0;

  // Outbox ids set the push order; give each its own millisecond so they
  // drain in the order they were made (see commitWorkoutImport).
  const base = Date.now() - rows.length;
  const outbox: OutboxEntry[] = rows.map((entity, i) => ({
    id: uuidv7(base + i),
    table: "bodyMeasurements",
    entity,
  }));
  await database.transaction("rw", database.bodyMeasurements, database.outbox, async () => {
    await database.bodyMeasurements.bulkPut(rows);
    await database.outbox.bulkPut(outbox);
  });
  return rows.length;
}
