import {
  INJURY_NOTE_MAX,
  INJURY_SIDES,
  type InjurySide,
  PAIN_MAX,
  PAIN_MIN,
  dayKey,
  injuryAreaLabel,
  isDayKey,
  isInjuryArea,
  isPainLevel,
  isPairedArea,
  isValidTimeZone,
  latestPainByDay,
  painLabel,
  painSuggestion,
  shouldAskHealed,
  uuidv7,
} from "@jim/core";
import { type DbOrTx, injuries, painCheckins, users } from "@jim/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUser, withUserWrite } from "../context.js";
import { MCP_DEVICE_ID } from "./create-routine.js";

/**
 * Injuries (issue #627, CONTEXT.md): the same report, pain check-in, heal
 * and delete the phone's Profile → Injuries offers. Days are the user's
 * local calendar days in their stored time zone (issue #511).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type InjuryRow = typeof injuries.$inferSelect;
type CheckinRow = typeof painCheckins.$inferSelect;

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

async function liveCheckins(tx: DbOrTx): Promise<CheckinRow[]> {
  return tx.select().from(painCheckins).where(isNull(painCheckins.deletedAt));
}

function describe(row: InjuryRow, checkins: readonly CheckinRow[], today: string) {
  const painByDay = latestPainByDay(checkins, row.id);
  const todaysPain = row.healedOn === null ? (painByDay.get(today) ?? null) : null;
  return {
    id: row.id,
    label: injuryAreaLabel(row.area, row.side),
    area: row.area,
    side: row.side,
    startedOn: row.startedOn,
    healedOn: row.healedOn,
    open: row.healedOn === null,
    note: row.note,
    todaysPain,
    /** What the app suggests for exercises that work this area today. */
    suggestion: painSuggestion(todaysPain),
    /** Three check-ins in a row at 0: worth asking the user if it's healed. */
    askHealed: row.healedOn === null && shouldAskHealed(checkins, row.id),
    painLog: [...painByDay.entries()].map(([day, painLevel]) => ({
      day,
      painLevel,
      label: painLabel(painLevel),
    })),
  };
}

/** One live injury by id, or by its label ("left knee") among the open ones. */
async function findInjury(tx: DbOrTx, ref: string): Promise<InjuryRow> {
  const rows = await tx.select().from(injuries).where(isNull(injuries.deletedAt));
  const trimmed = ref.trim();
  if (UUID_RE.test(trimmed)) {
    const row = rows.find((injury) => injury.id === trimmed);
    if (row) return row;
  }
  const wanted = trimmed.toLowerCase();
  const matches = rows.filter(
    (injury) =>
      injury.healedOn === null &&
      (injuryAreaLabel(injury.area, injury.side).toLowerCase() === wanted ||
        injury.area === wanted),
  );
  if (matches.length === 1 && matches[0]) return matches[0];
  if (matches.length > 1) {
    throw new Error(`More than one open injury matches "${ref}". Pass its id from list_injuries.`);
  }
  throw new Error(`No open injury matches "${ref}". Try list_injuries.`);
}

export async function listInjuries(context: UserContext, input: { includeHealed?: boolean }) {
  return withUser(context, async (tx) => {
    const today = await userToday(tx, context.userId);
    const rows = await tx.select().from(injuries).where(isNull(injuries.deletedAt));
    const checkins = await liveCheckins(tx);
    const sorted = rows.sort((a, b) => b.startedOn.localeCompare(a.startedOn));
    const open = sorted.filter((row) => row.healedOn === null);
    const healed = sorted.filter((row) => row.healedOn !== null);
    return {
      today,
      painScale: `${PAIN_MIN} (no pain) to ${PAIN_MAX} (worst)`,
      open: open.map((row) => describe(row, checkins, today)),
      healedCount: healed.length,
      healed: input.includeHealed ? healed.map((row) => describe(row, checkins, today)) : undefined,
    };
  });
}

export interface ReportInjuryInput {
  area: string;
  side?: InjurySide;
  /** YYYY-MM-DD; defaults to today. */
  startedOn?: string;
  /** Today's pain, 0–10. */
  painLevel: number;
  note?: string;
  dryRun?: boolean;
}

export async function reportInjury(context: UserContext, input: ReportInjuryInput) {
  return withUserWrite(context, input.dryRun ?? false, async (tx) => {
    const area = input.area.trim().toLowerCase();
    if (!isInjuryArea(area)) {
      throw new Error(
        `"${input.area}" isn't an injury area. Use a muscle or knee, elbow, wrist, hip or ankle.`,
      );
    }
    const paired = isPairedArea(area);
    if (paired && (!input.side || !INJURY_SIDES.includes(input.side))) {
      throw new Error(`Say which side: ${INJURY_SIDES.join(", ")}.`);
    }
    if (!isPainLevel(input.painLevel)) {
      throw new Error(`painLevel is a whole number from ${PAIN_MIN} to ${PAIN_MAX}.`);
    }
    const today = await userToday(tx, context.userId);
    const startedOn = checkDay(input.startedOn, today, "startedOn");
    const note = input.note?.trim() ? input.note.trim().slice(0, INJURY_NOTE_MAX) : null;
    const now = new Date();
    const id = uuidv7();
    await tx.insert(injuries).values({
      id,
      userId: context.userId,
      area,
      side: paired ? (input.side ?? null) : null,
      startedOn,
      note,
      createdAt: now,
      updatedAt: now,
      deviceId: MCP_DEVICE_ID,
    });
    await tx.insert(painCheckins).values({
      id: uuidv7(),
      userId: context.userId,
      injuryId: id,
      day: today,
      painLevel: input.painLevel,
      createdAt: now,
      updatedAt: now,
      deviceId: MCP_DEVICE_ID,
    });
    const [row] = await tx.select().from(injuries).where(eq(injuries.id, id));
    if (!row) throw new Error("The injury wasn't saved.");
    return describe(row, await liveCheckins(tx), today);
  });
}

export async function logPain(
  context: UserContext,
  input: { injury: string; painLevel: number; day?: string; dryRun?: boolean },
) {
  return withUserWrite(context, input.dryRun ?? false, async (tx) => {
    if (!isPainLevel(input.painLevel)) {
      throw new Error(`painLevel is a whole number from ${PAIN_MIN} to ${PAIN_MAX}.`);
    }
    const injury = await findInjury(tx, input.injury);
    if (injury.healedOn !== null) {
      throw new Error("That injury is healed. A new flare-up is a new injury: use report_injury.");
    }
    const today = await userToday(tx, context.userId);
    const day = checkDay(input.day, today, "day");
    if (day < injury.startedOn) throw new Error("That day is before the injury started.");
    const now = new Date();
    const [sameDay] = await tx
      .select()
      .from(painCheckins)
      .where(
        and(
          eq(painCheckins.injuryId, injury.id),
          eq(painCheckins.day, day),
          isNull(painCheckins.deletedAt),
        ),
      );
    if (sameDay) {
      await tx
        .update(painCheckins)
        .set({
          painLevel: input.painLevel,
          updatedAt: now,
          deviceId: MCP_DEVICE_ID,
          serverSeq: sql`nextval('sync_seq')`,
        })
        .where(eq(painCheckins.id, sameDay.id));
    } else {
      await tx.insert(painCheckins).values({
        id: uuidv7(),
        userId: context.userId,
        injuryId: injury.id,
        day,
        painLevel: input.painLevel,
        createdAt: now,
        updatedAt: now,
        deviceId: MCP_DEVICE_ID,
      });
    }
    return {
      ...describe(injury, await liveCheckins(tx), today),
      replacedSameDay: Boolean(sameDay),
    };
  });
}

export async function healInjury(
  context: UserContext,
  input: { injury: string; day?: string; dryRun?: boolean },
) {
  return withUserWrite(context, input.dryRun ?? false, async (tx) => {
    const injury = await findInjury(tx, input.injury);
    if (injury.healedOn !== null) throw new Error("That injury is already healed.");
    const today = await userToday(tx, context.userId);
    const healedOn = checkDay(input.day, today, "day");
    if (healedOn < injury.startedOn) throw new Error("An injury can't heal before it started.");
    await tx
      .update(injuries)
      .set({
        healedOn,
        updatedAt: new Date(),
        deviceId: MCP_DEVICE_ID,
        serverSeq: sql`nextval('sync_seq')`,
      })
      .where(eq(injuries.id, injury.id));
    return describe({ ...injury, healedOn }, await liveCheckins(tx), today);
  });
}

export async function deleteInjury(
  context: UserContext,
  input: { injury: string; dryRun?: boolean },
) {
  return withUserWrite(context, input.dryRun ?? false, async (tx) => {
    const injury = await findInjury(tx, input.injury);
    const now = new Date();
    const bump = { deletedAt: now, updatedAt: now, deviceId: MCP_DEVICE_ID };
    await tx
      .update(injuries)
      .set({ ...bump, serverSeq: sql`nextval('sync_seq')` })
      .where(eq(injuries.id, injury.id));
    const removed = await tx
      .update(painCheckins)
      .set({ ...bump, serverSeq: sql`nextval('sync_seq')` })
      .where(and(eq(painCheckins.injuryId, injury.id), isNull(painCheckins.deletedAt)))
      .returning({ id: painCheckins.id });
    return {
      id: injury.id,
      label: injuryAreaLabel(injury.area, injury.side),
      deleted: true,
      checkinsDeleted: removed.length,
    };
  });
}
