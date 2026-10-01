import { mutate } from "@/lib/db/mutate";
import { type BodyMeasurementRow, type JimDatabase, type OutboxEntry, db } from "@/lib/db/schema";
import { getCachedSettings, patchSettings } from "@/lib/settings";
import { getDeviceId } from "@/lib/sync/engine";
import {
  type ImportedWeight,
  type WeightCsvFormat,
  type WeightUnit,
  convertWeight,
  parseWeightCsv,
  uuidv7,
  weightEntryKey,
} from "@jim/core";

/**
 * Bodyweight over time (issue #377). Each weigh-in is a `body_measurements`
 * row (kind "bodyweight"), written through the outbox like everything else
 * the phone logs, so it syncs. Rows keep the unit they were entered in;
 * readers convert to the user's current units.
 */

export const BODYWEIGHT_KIND = "bodyweight";

export interface BodyweightPoint {
  id: string;
  measuredAt: Date;
  /** In the units asked for, to two decimals. */
  value: number;
}

function isLiveBodyweight(row: BodyMeasurementRow): boolean {
  return row.kind === BODYWEIGHT_KIND && !row.deletedAt;
}

/** Live weigh-ins in `units`, oldest first. */
export function bodyweightSeries(
  rows: readonly BodyMeasurementRow[],
  units: WeightUnit,
): BodyweightPoint[] {
  return rows
    .filter(isLiveBodyweight)
    .map((row) => ({
      id: row.id,
      measuredAt: row.measuredAt,
      value: convertWeight(Number(row.value), row.unit, units),
    }))
    .filter((point) => Number.isFinite(point.value))
    .sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());
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
 * Logs a weigh-in. A day holds one manual entry: logging again on a day that
 * already has one updates it instead of stacking a second point.
 */
export async function logBodyweight(
  input: { userId: string; value: number; unit: WeightUnit; measuredAt: Date },
  database: JimDatabase = db,
): Promise<BodyMeasurementRow> {
  const deviceId = await getDeviceId(database);
  const now = new Date();
  const rows = await database.bodyMeasurements.toArray();
  const sameDay = rows.find(
    (row) => isLiveBodyweight(row) && sameLocalDay(row.measuredAt, input.measuredAt),
  );
  const entity: BodyMeasurementRow = {
    id: sameDay?.id ?? uuidv7(),
    userId: input.userId,
    kind: BODYWEIGHT_KIND,
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

export async function deleteBodyweight(
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
