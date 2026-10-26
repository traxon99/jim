import {
  INJURY_NOTE_MAX,
  INJURY_SIDES,
  type InjuryRuleEffect,
  type InjurySide,
  PAIN_MAX,
  PAIN_MIN,
  cleanInjuryRule,
  dayKey,
  describeInjuryRule,
  injuryAreaLabel,
  isDayKey,
  isInjuryArea,
  isPainLevel,
  isPairedArea,
  isValidTimeZone,
  latestPainByDay,
  painLabel,
  painSuggestion,
  parseInjuryRules,
  ruleMaxWeight,
  shouldAskHealed,
  uuidv7,
  withInjuryRule,
  withoutInjuryRule,
} from "@jim/core";
import { type DbOrTx, injuries, painCheckins, users } from "@jim/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUser, withUserWrite } from "../context.js";
import { MCP_DEVICE_ID } from "./create-routine.js";
import { resolveExercise, visibleExercises } from "./resolve-exercise.js";

/**
 * Injuries (issue #627, CONTEXT.md): the same report, pain check-in, heal
 * and delete the phone's Profile → Injuries offers, plus exercise rules
 * (issue #724) that say how one injury treats one exercise. Days are the
 * user's local calendar days in their stored time zone (issue #511).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type InjuryRow = typeof injuries.$inferSelect;
type CheckinRow = typeof painCheckins.$inferSelect;

interface UserDay {
  today: string;
  units: "kg" | "lb";
}

async function userDay(tx: DbOrTx, userId: string): Promise<UserDay> {
  const [user] = await tx
    .select({ timeZone: users.timeZone, units: users.units })
    .from(users)
    .where(eq(users.id, userId));
  const zone = user?.timeZone && isValidTimeZone(user.timeZone) ? user.timeZone : undefined;
  return { today: dayKey(new Date(), zone ?? "UTC"), units: user?.units ?? "lb" };
}

async function exerciseNames(tx: DbOrTx): Promise<Map<string, string>> {
  return new Map((await visibleExercises(tx)).map((row) => [row.id, row.name]));
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

function describeRules(row: InjuryRow, names: ReadonlyMap<string, string>, units: "kg" | "lb") {
  return parseInjuryRules(row.exerciseRules).map((rule) => ({
    exerciseId: rule.exerciseId,
    exercise: names.get(rule.exerciseId) ?? null,
    effect: rule.effect,
    maxWeight: ruleMaxWeight(rule, units),
    units: rule.maxWeight === null ? null : units,
    repsLow: rule.repsLow,
    repsHigh: rule.repsHigh,
    note: rule.note,
    summary: describeInjuryRule(rule, units),
  }));
}

function describe(
  row: InjuryRow,
  checkins: readonly CheckinRow[],
  { today, units }: UserDay,
  names: ReadonlyMap<string, string>,
) {
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
    /** How this injury treats specific exercises, in place of the area-wide suggestion. */
    exerciseRules: describeRules(row, names, units),
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
    const day = await userDay(tx, context.userId);
    const rows = await tx.select().from(injuries).where(isNull(injuries.deletedAt));
    const checkins = await liveCheckins(tx);
    const names = await exerciseNames(tx);
    const sorted = rows.sort((a, b) => b.startedOn.localeCompare(a.startedOn));
    const open = sorted.filter((row) => row.healedOn === null);
    const healed = sorted.filter((row) => row.healedOn !== null);
    return {
      today: day.today,
      painScale: `${PAIN_MIN} (no pain) to ${PAIN_MAX} (worst)`,
      open: open.map((row) => describe(row, checkins, day, names)),
      healedCount: healed.length,
      healed: input.includeHealed
        ? healed.map((row) => describe(row, checkins, day, names))
        : undefined,
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
    const day = await userDay(tx, context.userId);
    const today = day.today;
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
    return describe(row, await liveCheckins(tx), day, new Map());
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
    const userDayInfo = await userDay(tx, context.userId);
    const today = userDayInfo.today;
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
      ...describe(injury, await liveCheckins(tx), userDayInfo, await exerciseNames(tx)),
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
    const day = await userDay(tx, context.userId);
    const healedOn = checkDay(input.day, day.today, "day");
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
    return describe({ ...injury, healedOn }, await liveCheckins(tx), day, await exerciseNames(tx));
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

export interface SetInjuryExerciseRuleInput {
  injury: string;
  exercise: string;
  effect: InjuryRuleEffect;
  /** In the user's units. */
  maxWeight?: number | null;
  repsLow?: number | null;
  repsHigh?: number | null;
  note?: string | null;
  dryRun?: boolean;
}

async function saveRules(tx: DbOrTx, injury: InjuryRow, rules: InjuryRow["exerciseRules"]) {
  await tx
    .update(injuries)
    .set({
      exerciseRules: rules,
      updatedAt: new Date(),
      deviceId: MCP_DEVICE_ID,
      serverSeq: sql`nextval('sync_seq')`,
    })
    .where(eq(injuries.id, injury.id));
}

/**
 * Sets how an injury treats one exercise (issue #724), replacing any rule it
 * had for that exercise. The rule applies while the injury is open, even to
 * an exercise that doesn't work the injured area.
 */
export async function setInjuryExerciseRule(
  context: UserContext,
  input: SetInjuryExerciseRuleInput,
) {
  return withUserWrite(context, input.dryRun ?? false, async (tx) => {
    const injury = await findInjury(tx, input.injury);
    if (injury.healedOn !== null) {
      throw new Error("That injury is healed, so its rules no longer apply.");
    }
    const exercise = await resolveExercise(tx, context.userId, input.exercise);
    const takesWeight =
      exercise.trackingType === "weight_reps" || exercise.trackingType === "weighted_bodyweight";
    if (input.maxWeight != null && !takesWeight) {
      throw new Error(`${exercise.name} isn't logged with a weight, so it can't take maxWeight.`);
    }
    const takesReps = takesWeight || exercise.trackingType === "bodyweight";
    if ((input.repsLow != null || input.repsHigh != null) && !takesReps) {
      throw new Error(`${exercise.name} isn't logged in reps, so it can't take a rep range.`);
    }
    const day = await userDay(tx, context.userId);
    const cleaned = cleanInjuryRule({
      exerciseId: exercise.id,
      effect: input.effect,
      maxWeight: input.maxWeight ?? null,
      units: day.units,
      repsLow: input.repsLow ?? null,
      repsHigh: input.repsHigh ?? null,
      note: input.note ?? null,
    });
    if (!cleaned.ok) throw new Error(`${cleaned.error}.`);
    const before = parseInjuryRules(injury.exerciseRules);
    const rules = withInjuryRule(before, cleaned.rule);
    await saveRules(tx, injury, rules);
    const names = new Map([[exercise.id, exercise.name]]);
    return {
      injury: injuryAreaLabel(injury.area, injury.side),
      replaced: before.some((rule) => rule.exerciseId === exercise.id),
      rule: describeRules({ ...injury, exerciseRules: [cleaned.rule] }, names, day.units)[0],
      ruleCount: rules.length,
    };
  });
}

/** Drops an injury's rule for one exercise, so the area-wide treatment applies again. */
export async function clearInjuryExerciseRule(
  context: UserContext,
  input: { injury: string; exercise: string; dryRun?: boolean },
) {
  return withUserWrite(context, input.dryRun ?? false, async (tx) => {
    const injury = await findInjury(tx, input.injury);
    const before = parseInjuryRules(injury.exerciseRules);
    const names = await exerciseNames(tx);
    // Match a rule by the exercise it names, even one no longer resolvable by name.
    const trimmed = input.exercise.trim();
    let exerciseId = before.find(
      (rule) =>
        rule.exerciseId === trimmed ||
        names.get(rule.exerciseId)?.toLowerCase() === trimmed.toLowerCase(),
    )?.exerciseId;
    exerciseId ??= (await resolveExercise(tx, context.userId, trimmed)).id;
    if (!before.some((rule) => rule.exerciseId === exerciseId)) {
      throw new Error(
        `${injuryAreaLabel(injury.area, injury.side)} has no rule for "${input.exercise}".`,
      );
    }
    const rules = withoutInjuryRule(before, exerciseId);
    await saveRules(tx, injury, rules);
    return {
      injury: injuryAreaLabel(injury.area, injury.side),
      exerciseId,
      exercise: names.get(exerciseId) ?? null,
      cleared: true,
      ruleCount: rules.length,
    };
  });
}
