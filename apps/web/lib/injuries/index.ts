import { mutate } from "@/lib/db/mutate";
import { type InjuryRow, type JimDatabase, type PainCheckinRow, db } from "@/lib/db/schema";
import { getDeviceId } from "@/lib/sync/engine";
import {
  INJURY_SIDES,
  type InjurySide,
  PAIN_MAX,
  PAIN_MIN,
  injuryAreaLabel,
  isDayKey,
  isInjuryArea,
  isPainLevel,
  isPairedArea,
  uuidv7,
} from "@jim/core";

/**
 * Injuries (issue #627, CONTEXT.md): a hurt area the user trains around,
 * open from the day it's reported until they mark it healed, with one pain
 * check-in per day. Both are outbox rows, so reporting and checking in work
 * offline and sync. Jim may ask "Healed?" but only the user heals one, and
 * a later flare-up in the same area is a new injury.
 */

export const INJURY_NOTE_MAX = 500;

export interface ReportInjuryInput {
  userId: string;
  area: string;
  side: InjurySide | null;
  startedOn: string;
  /** Today's pain, logged as today's check-in. */
  painLevel: number;
  note?: string | null;
  /** The user's local day, YYYY-MM-DD. */
  today: string;
}

/** Trims and validates a report; returns an error message, or the cleaned fields. */
export function cleanInjuryInput(
  input: Omit<ReportInjuryInput, "userId">,
):
  | { ok: true; area: string; side: InjurySide | null; startedOn: string; note: string | null }
  | { ok: false; error: string } {
  if (!isInjuryArea(input.area)) return { ok: false, error: "Pick where it hurts" };
  const paired = isPairedArea(input.area);
  if (paired && (!input.side || !INJURY_SIDES.includes(input.side))) {
    return { ok: false, error: "Pick a side" };
  }
  if (!isDayKey(input.startedOn)) return { ok: false, error: "Pick when it started" };
  if (input.startedOn > input.today)
    return { ok: false, error: "An injury can't start in the future" };
  if (!isPainLevel(input.painLevel)) {
    return { ok: false, error: `Pain is ${PAIN_MIN} to ${PAIN_MAX}` };
  }
  const note = input.note?.trim() ?? "";
  return {
    ok: true,
    area: input.area,
    side: paired ? input.side : null,
    startedOn: input.startedOn,
    note: note === "" ? null : note.slice(0, INJURY_NOTE_MAX),
  };
}

export async function reportInjury(
  input: ReportInjuryInput,
  database: JimDatabase = db,
): Promise<InjuryRow> {
  const cleaned = cleanInjuryInput(input);
  if (!cleaned.ok) throw new Error(cleaned.error);
  const now = new Date();
  const entity: InjuryRow = {
    id: uuidv7(),
    userId: input.userId,
    area: cleaned.area,
    side: cleaned.side,
    startedOn: cleaned.startedOn,
    healedOn: null,
    note: cleaned.note,
    createdAt: now,
    updatedAt: now,
    deviceId: await getDeviceId(database),
    deletedAt: null,
    serverSeq: 0,
  };
  await mutate("injuries", entity, database);
  await logPain(entity, input.painLevel, input.today, database);
  return entity;
}

/** Logs `day`'s pain for an injury; a second check-in the same day updates the first. */
export async function logPain(
  injury: Pick<InjuryRow, "id" | "userId">,
  painLevel: number,
  day: string,
  database: JimDatabase = db,
): Promise<PainCheckinRow> {
  if (!isPainLevel(painLevel)) throw new Error(`Pain is ${PAIN_MIN} to ${PAIN_MAX}`);
  if (!isDayKey(day)) throw new Error("Pick a day");
  const deviceId = await getDeviceId(database);
  const now = new Date();
  const sameDay = (await database.painCheckins.where("injuryId").equals(injury.id).toArray())
    .filter((row) => row.day === day && !row.deletedAt)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
  const entity: PainCheckinRow = sameDay
    ? { ...sameDay, painLevel, updatedAt: now, deviceId }
    : {
        id: uuidv7(),
        userId: injury.userId,
        injuryId: injury.id,
        day,
        painLevel,
        createdAt: now,
        updatedAt: now,
        deviceId,
        deletedAt: null,
        serverSeq: 0,
      };
  await mutate("painCheckins", entity, database);
  return entity;
}

/** Closes an injury on `day`. Only the user does this; Jim only asks. */
export async function markHealed(
  injury: InjuryRow,
  day: string,
  database: JimDatabase = db,
): Promise<InjuryRow> {
  if (!isDayKey(day) || day < injury.startedOn) {
    throw new Error("An injury can't heal before it started");
  }
  const entity: InjuryRow = {
    ...injury,
    healedOn: day,
    updatedAt: new Date(),
    deviceId: await getDeviceId(database),
  };
  await mutate("injuries", entity, database);
  return entity;
}

/** Reopens an injury marked healed by mistake. */
export async function reopenInjury(
  injury: InjuryRow,
  database: JimDatabase = db,
): Promise<InjuryRow> {
  const entity: InjuryRow = {
    ...injury,
    healedOn: null,
    updatedAt: new Date(),
    deviceId: await getDeviceId(database),
  };
  await mutate("injuries", entity, database);
  return entity;
}

/** Tombstones an injury and its check-ins. */
export async function deleteInjury(injury: InjuryRow, database: JimDatabase = db): Promise<void> {
  const deviceId = await getDeviceId(database);
  const now = new Date();
  await mutate("injuries", { ...injury, deletedAt: now, updatedAt: now, deviceId }, database);
  const checkins = await database.painCheckins.where("injuryId").equals(injury.id).toArray();
  for (const row of checkins) {
    if (row.deletedAt) continue;
    await mutate("painCheckins", { ...row, deletedAt: now, updatedAt: now, deviceId }, database);
  }
}

/** Open injuries, most recently started first. */
export function sortOpenInjuries(rows: readonly InjuryRow[]): InjuryRow[] {
  return rows
    .filter((row) => !row.deletedAt && row.healedOn === null)
    .sort(
      (a, b) =>
        b.startedOn.localeCompare(a.startedOn) || b.createdAt.getTime() - a.createdAt.getTime(),
    );
}

export interface InjuryHistoryGroup {
  /** e.g. "Left knee". */
  label: string;
  /** Healed injuries in this area and side, newest first. */
  injuries: InjuryRow[];
}

/**
 * Healed injuries grouped by area and side, so a flare-up sits with the
 * earlier injuries in the same place; the group hurt most recently first.
 */
export function injuryHistoryByArea(rows: readonly InjuryRow[]): InjuryHistoryGroup[] {
  const groups = new Map<string, InjuryHistoryGroup>();
  const healed = rows
    .filter((row) => !row.deletedAt && row.healedOn !== null)
    .sort((a, b) => b.startedOn.localeCompare(a.startedOn));
  for (const row of healed) {
    const label = injuryAreaLabel(row.area, row.side);
    const group = groups.get(label) ?? { label, injuries: [] };
    group.injuries.push(row);
    groups.set(label, group);
  }
  return [...groups.values()];
}
