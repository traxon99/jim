import {
  type MeasurementKind,
  type MeasurementUnit,
  convertMeasurement,
  displayUnitFor,
  measurementDimension,
  uuidv7,
} from "@jim/core";
import { type DbOrTx, bodyMeasurements, users } from "@jim/db";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUserWrite } from "../context.js";
import { MCP_DEVICE_ID } from "./create-routine.js";

const OFFSET_RE = /([+-])(\d{2}):?(\d{2})$/;

/** Minutes east of UTC written in an ISO string ("Z" or none = 0). */
function offsetMinutes(iso: string): number {
  const match = OFFSET_RE.exec(iso);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

/** The calendar day `date` falls on at `offset` minutes from UTC, as YYYY-MM-DD. */
function dayKey(date: Date, offset: number): string {
  return new Date(date.getTime() + offset * 60_000).toISOString().slice(0, 10);
}

function unitsMatch(kind: MeasurementKind, unit: MeasurementUnit): boolean {
  const dimension = measurementDimension(kind);
  if (dimension === "weight") return unit === "lb" || unit === "kg";
  if (dimension === "percent") return unit === "pct";
  return unit === "in" || unit === "cm";
}

export interface LogBodyMeasurementInput {
  kind: MeasurementKind;
  value: number;
  /** Defaults to the unit the phone shows this kind in (the user's lb/kg, in/cm, or %). */
  unit?: MeasurementUnit;
  /** ISO date/time with offset; defaults to now. Its offset decides which day it lands on. */
  measuredAt?: string;
  dryRun?: boolean;
}

/**
 * Logs a weigh-in, body fat or a circumference like the phone's Body tab
 * does: one entry per kind per day, so logging again the same day updates
 * that day's entry. A weigh-in that is now the latest also becomes the
 * profile's current bodyweight, which strength standards read.
 */
export async function logBodyMeasurement(context: UserContext, input: LogBodyMeasurementInput) {
  return withUserWrite(context, input.dryRun ?? false, async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, context.userId));
    const units = user?.units ?? "lb";
    const unit = input.unit ?? displayUnitFor(input.kind, units);
    if (!unitsMatch(input.kind, unit)) {
      throw new Error(`${unit} isn't a unit for ${input.kind}.`);
    }
    const measuredAt = input.measuredAt ? new Date(input.measuredAt) : new Date();
    const offset = input.measuredAt ? offsetMinutes(input.measuredAt) : 0;
    const now = new Date();
    const value = String(Math.round(input.value * 100) / 100);

    const sameKind = await tx
      .select()
      .from(bodyMeasurements)
      .where(and(eq(bodyMeasurements.kind, input.kind), isNull(bodyMeasurements.deletedAt)));
    const sameDay = sameKind.find(
      (row) => dayKey(row.measuredAt, offset) === dayKey(measuredAt, offset),
    );

    let id: string;
    if (sameDay) {
      id = sameDay.id;
      await tx
        .update(bodyMeasurements)
        .set({
          value,
          unit,
          updatedAt: now,
          deviceId: MCP_DEVICE_ID,
          serverSeq: sql`nextval('sync_seq')`,
        })
        .where(eq(bodyMeasurements.id, id));
    } else {
      id = uuidv7();
      await tx.insert(bodyMeasurements).values({
        id,
        userId: context.userId,
        kind: input.kind,
        value,
        unit,
        measuredAt,
        updatedAt: now,
        deviceId: MCP_DEVICE_ID,
      });
    }

    const currentBodyweight =
      input.kind === "bodyweight" ? await syncCurrentBodyweight(tx, context.userId, units) : null;

    return {
      id,
      kind: input.kind,
      value: Number(value),
      unit,
      measuredAt: (sameDay?.measuredAt ?? measuredAt).toISOString(),
      replacedSameDay: Boolean(sameDay),
      ...(currentBodyweight != null ? { currentBodyweight } : {}),
    };
  });
}

/** Mirrors the phone's syncCurrentBodyweight: the profile's bodyweight follows the latest weigh-in. */
async function syncCurrentBodyweight(
  tx: DbOrTx,
  userId: string,
  units: "lb" | "kg",
): Promise<number | null> {
  const [latest] = await tx
    .select()
    .from(bodyMeasurements)
    .where(and(eq(bodyMeasurements.kind, "bodyweight"), isNull(bodyMeasurements.deletedAt)))
    .orderBy(desc(bodyMeasurements.measuredAt))
    .limit(1);
  if (!latest) return null;
  const converted = convertMeasurement(Number(latest.value), latest.unit, units);
  if (converted == null) return null;
  const rounded = Math.round(converted * 10) / 10;
  await tx
    .update(users)
    .set({ bodyweight: String(rounded) })
    .where(eq(users.id, userId));
  return rounded;
}

export async function deleteBodyMeasurement(
  context: UserContext,
  input: { id: string; dryRun?: boolean },
) {
  return withUserWrite(context, input.dryRun ?? false, async (tx) => {
    const [row] = await tx.select().from(bodyMeasurements).where(eq(bodyMeasurements.id, input.id));
    if (!row || row.deletedAt) {
      throw new Error(`No measurement found with id ${input.id}. Try get_body_measurements.`);
    }
    const now = new Date();
    await tx
      .update(bodyMeasurements)
      .set({
        deletedAt: now,
        updatedAt: now,
        deviceId: MCP_DEVICE_ID,
        serverSeq: sql`nextval('sync_seq')`,
      })
      .where(eq(bodyMeasurements.id, row.id));
    return {
      id: row.id,
      kind: row.kind,
      measuredAt: row.measuredAt.toISOString(),
      deleted: true,
    };
  });
}
