import {
  SICK_DAY_NOTE_MAX,
  SICK_DAY_RANGE_MAX,
  dayKey,
  dayKeysBetween,
  isDayKey,
  isValidTimeZone,
  uuidv7,
} from "@jim/core";
import { type DbOrTx, sickDays, users } from "@jim/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUser, withUserWrite } from "../context.js";
import { MCP_DEVICE_ID } from "./create-routine.js";

/**
 * Sick days (issue #779, CONTEXT.md): the same marking the phone's History
 * and Workout tabs offer. Days are the user's local calendar days in their
 * stored time zone (issue #511). A sick day never changes a workout; it
 * lowers its week's streak target by one and pushes a PRP block's end back.
 */

type SickDayRow = typeof sickDays.$inferSelect;

async function userToday(tx: DbOrTx, userId: string): Promise<string> {
  const [user] = await tx
    .select({ timeZone: users.timeZone })
    .from(users)
    .where(eq(users.id, userId));
  const zone = user?.timeZone && isValidTimeZone(user.timeZone) ? user.timeZone : undefined;
  return dayKey(new Date(), zone ?? "UTC");
}

function checkDay(day: string | undefined, today: string, what: string): string {
  if (day === undefined) return today;
  if (!isDayKey(day)) throw new Error(`${what} must be a date written YYYY-MM-DD.`);
  if (day > today) throw new Error(`${what} can't be in the future.`);
  return day;
}

/** Every day from `from` to `to`, checked against today and the range cap. */
function rangeDays(from: string, to: string): string[] {
  if (to < from) throw new Error("to must be on or after from.");
  const days = dayKeysBetween(from, to);
  if (days.length > SICK_DAY_RANGE_MAX) {
    throw new Error(`Mark at most ${SICK_DAY_RANGE_MAX} days at a time.`);
  }
  return days;
}

async function liveRows(tx: DbOrTx, days?: readonly string[]): Promise<SickDayRow[]> {
  const live = isNull(sickDays.deletedAt);
  return tx
    .select()
    .from(sickDays)
    .where(days ? and(live, inArray(sickDays.day, [...days])) : live);
}

export async function listSickDays(context: UserContext, input: { from?: string; to?: string }) {
  return withUser(context, async (tx) => {
    const today = await userToday(tx, context.userId);
    if (input.from !== undefined && !isDayKey(input.from)) {
      throw new Error("from must be a date written YYYY-MM-DD.");
    }
    if (input.to !== undefined && !isDayKey(input.to)) {
      throw new Error("to must be a date written YYYY-MM-DD.");
    }
    const byDay = new Map<string, SickDayRow>();
    for (const row of await liveRows(tx)) {
      if (input.from && row.day < input.from) continue;
      if (input.to && row.day > input.to) continue;
      const kept = byDay.get(row.day);
      if (!kept || row.updatedAt > kept.updatedAt) byDay.set(row.day, row);
    }
    const days = [...byDay.values()]
      .sort((a, b) => b.day.localeCompare(a.day))
      .map((row) => ({ day: row.day, note: row.note }));
    return { today, sickToday: byDay.has(today), count: days.length, sickDays: days };
  });
}

export interface MarkSickDaysInput {
  /** YYYY-MM-DD; defaults to today. */
  from?: string;
  /** YYYY-MM-DD; defaults to `from`. */
  to?: string;
  note?: string;
  dryRun?: boolean;
}

export async function markSickDays(context: UserContext, input: MarkSickDaysInput) {
  return withUserWrite(context, input.dryRun ?? false, async (tx) => {
    const today = await userToday(tx, context.userId);
    const from = checkDay(input.from, today, "from");
    const to = checkDay(input.to ?? from, today, "to");
    const days = rangeDays(from, to);
    const note = input.note?.trim() ? input.note.trim().slice(0, SICK_DAY_NOTE_MAX) : null;
    const existing = new Map((await liveRows(tx, days)).map((row) => [row.day, row]));
    const now = new Date();
    const marked: string[] = [];
    const alreadySick: string[] = [];
    for (const day of days) {
      const row = existing.get(day);
      if (row) {
        alreadySick.push(day);
        if (input.note !== undefined && row.note !== note) {
          await tx
            .update(sickDays)
            .set({
              note,
              updatedAt: now,
              deviceId: MCP_DEVICE_ID,
              serverSeq: sql`nextval('sync_seq')`,
            })
            .where(eq(sickDays.id, row.id));
        }
        continue;
      }
      await tx.insert(sickDays).values({
        id: uuidv7(),
        userId: context.userId,
        day,
        note,
        createdAt: now,
        updatedAt: now,
        deviceId: MCP_DEVICE_ID,
      });
      marked.push(day);
    }
    return { marked, alreadySick, note };
  });
}

export async function unmarkSickDays(
  context: UserContext,
  input: { from: string; to?: string; dryRun?: boolean },
) {
  return withUserWrite(context, input.dryRun ?? true, async (tx) => {
    if (!isDayKey(input.from)) throw new Error("from must be a date written YYYY-MM-DD.");
    const to = input.to ?? input.from;
    if (!isDayKey(to)) throw new Error("to must be a date written YYYY-MM-DD.");
    const days = rangeDays(input.from, to);
    const now = new Date();
    const removed = await tx
      .update(sickDays)
      .set({
        deletedAt: now,
        updatedAt: now,
        deviceId: MCP_DEVICE_ID,
        serverSeq: sql`nextval('sync_seq')`,
      })
      .where(and(isNull(sickDays.deletedAt), inArray(sickDays.day, days)))
      .returning({ day: sickDays.day });
    return { unmarked: [...new Set(removed.map((row) => row.day))].sort() };
  });
}
