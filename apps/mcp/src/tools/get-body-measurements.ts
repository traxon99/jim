import {
  MEASUREMENT_KINDS,
  type MeasurementKind,
  type MeasurementUnit,
  convertMeasurement,
  displayUnitFor,
  isMeasurementKind,
} from "@jim/core";
import { bodyMeasurements, users } from "@jim/db";
import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUser } from "../context.js";

export interface GetBodyMeasurementsInput {
  kinds?: MeasurementKind[];
  from?: string;
  to?: string;
}

export interface MeasurementSeries {
  kind: MeasurementKind;
  unit: MeasurementUnit;
  latest: { id: string; value: number; measuredAt: string } | null;
  /** Latest minus the first entry in range; null with fewer than two. */
  change: number | null;
  entries: { id: string; value: number; measuredAt: string }[];
}

/**
 * Read-only (issue #249): bodyweight, body fat and circumferences over
 * time, each kind converted to the unit the phone shows it in (the user's
 * lb/kg, inches or centimetres to match, percent for body fat).
 */
export async function getBodyMeasurements(
  context: UserContext,
  input: GetBodyMeasurementsInput,
): Promise<{ units: "lb" | "kg"; measurements: MeasurementSeries[] }> {
  return withUser(context, async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, context.userId));
    const units = user?.units ?? "lb";

    const conditions = [isNull(bodyMeasurements.deletedAt)];
    if (input.kinds?.length) conditions.push(inArray(bodyMeasurements.kind, input.kinds));
    if (input.from) conditions.push(gte(bodyMeasurements.measuredAt, new Date(input.from)));
    if (input.to) conditions.push(lte(bodyMeasurements.measuredAt, new Date(input.to)));

    const rows = await tx
      .select()
      .from(bodyMeasurements)
      .where(and(...conditions))
      .orderBy(asc(bodyMeasurements.measuredAt));

    const byKind = new Map<MeasurementKind, MeasurementSeries>();
    for (const row of rows) {
      if (!isMeasurementKind(row.kind)) continue;
      const unit = displayUnitFor(row.kind, units);
      const value = convertMeasurement(Number(row.value), row.unit, unit);
      if (value == null || !Number.isFinite(value)) continue;
      let series = byKind.get(row.kind);
      if (!series) {
        series = { kind: row.kind, unit, latest: null, change: null, entries: [] };
        byKind.set(row.kind, series);
      }
      series.entries.push({ id: row.id, value, measuredAt: row.measuredAt.toISOString() });
    }

    const measurements = MEASUREMENT_KINDS.flatMap((kind) => {
      const series = byKind.get(kind);
      if (!series) return [];
      const first = series.entries[0];
      const last = series.entries[series.entries.length - 1];
      series.latest = last ?? null;
      series.change =
        first && last && series.entries.length > 1
          ? Math.round((last.value - first.value) * 100) / 100
          : null;
      return [series];
    });
    return { units, measurements };
  });
}
