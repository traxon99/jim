import { mutate } from "@/lib/db/mutate";
import { type JimDatabase, type SickDayRow, db } from "@/lib/db/schema";
import { getDeviceId } from "@/lib/sync/engine";
import { SICK_DAY_NOTE_MAX, isDayKey, uuidv7 } from "@jim/core";

/**
 * Sick days (issue #779, CONTEXT.md): a local day the user marks as sick.
 * Outbox rows like injuries, so marking works offline and syncs. A sick day
 * never changes a workout; it excuses the day from the weekly streak and
 * pushes a PRP block's end back.
 */

export interface MarkSickDayInput {
  userId: string;
  /** YYYY-MM-DD. */
  day: string;
  /** The user's local day, YYYY-MM-DD; a sick day can't be in the future. */
  today: string;
  note?: string | null;
}

function cleanNote(note: string | null | undefined): string | null {
  const trimmed = note?.trim() ?? "";
  return trimmed === "" ? null : trimmed.slice(0, SICK_DAY_NOTE_MAX);
}

async function liveRowsFor(day: string, database: JimDatabase): Promise<SickDayRow[]> {
  return (await database.sickDays.where("day").equals(day).toArray()).filter(
    (row) => !row.deletedAt,
  );
}

/** Marks `day` as sick; marking a day that's already sick updates its note. */
export async function markSickDay(
  input: MarkSickDayInput,
  database: JimDatabase = db,
): Promise<SickDayRow> {
  if (!isDayKey(input.day)) throw new Error("Pick a day");
  if (input.day > input.today) throw new Error("A sick day can't be in the future");
  const note = cleanNote(input.note);
  const now = new Date();
  const deviceId = await getDeviceId(database);
  const existing = (await liveRowsFor(input.day, database)).sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  )[0];
  if (existing) {
    if (input.note === undefined || existing.note === note) return existing;
    const entity: SickDayRow = { ...existing, note, updatedAt: now, deviceId };
    await mutate("sickDays", entity, database);
    return entity;
  }
  const entity: SickDayRow = {
    id: uuidv7(),
    userId: input.userId,
    day: input.day,
    note,
    createdAt: now,
    updatedAt: now,
    deviceId,
    deletedAt: null,
    serverSeq: 0,
  };
  await mutate("sickDays", entity, database);
  return entity;
}

/** Unmarks `day`: tombstones every live row for it (two devices may each have marked it). */
export async function unmarkSickDay(day: string, database: JimDatabase = db): Promise<void> {
  const rows = await liveRowsFor(day, database);
  if (rows.length === 0) return;
  const now = new Date();
  const deviceId = await getDeviceId(database);
  for (const row of rows) {
    await mutate("sickDays", { ...row, deletedAt: now, updatedAt: now, deviceId }, database);
  }
}
