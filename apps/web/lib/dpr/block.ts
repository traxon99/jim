import { mutate } from "@/lib/db/mutate";
import {
  type DprBlockLiftRow,
  type DprBlockRow,
  type ExerciseRow,
  type JimDatabase,
  type SettingsRow,
  db,
} from "@/lib/db/schema";
import { strengthProfileFromSettings } from "@/lib/strength-standards/profile";
import { getDeviceId } from "@/lib/sync/engine";
import {
  DPR_DELOAD_WEEK_DAYS,
  DPR_MAX_FOCUS,
  DPR_PRESETS,
  type DprBlockWeeks,
  type DprPresetName,
  type ExperienceLevel,
  type StandardLift,
  baselineE1rm,
  computeGoal,
  currentBlockOf,
  inferExperience,
  standardLiftForSlug,
  uuidv7,
} from "@jim/core";
import { type DprSnapshot, e1rmSeries } from "./data";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The block DPR is running now (active or in its deload week), newest first wins. */
export function currentBlock(blocks: readonly DprBlockRow[]): DprBlockRow | null {
  return currentBlockOf(blocks);
}

export function liveBlockLifts(
  lifts: readonly DprBlockLiftRow[],
  blockId: string,
): DprBlockLiftRow[] {
  return lifts
    .filter((lift) => lift.blockId === blockId && !lift.deletedAt)
    .sort((a, b) => a.position - b.position);
}

export interface ExperienceGuess {
  level: ExperienceLevel;
  /** e.g. "Based on 14 months of history and your bench vs. standards". */
  explanation: string;
}

const LIFT_LABELS: Record<StandardLift, string> = {
  squat: "squat",
  benchPress: "bench",
  deadlift: "deadlift",
  overheadPress: "overhead press",
};

function describeHistory(weeks: number): string {
  if (weeks < 8) return `${Math.max(1, Math.round(weeks))} weeks of history`;
  const months = Math.round(weeks / 4.345);
  if (months < 24) return `${months} months of history`;
  const years = Math.round((weeks / 52) * 10) / 10;
  return `${years} years of history`;
}

export function guessExperience(
  snapshot: DprSnapshot,
  exercises: readonly Pick<ExerciseRow, "id" | "slug">[],
  settings: SettingsRow,
  now: Date,
  bodyweightAt: (date: Date) => number | null = () => null,
): ExperienceGuess {
  const historyWeeks = snapshot.firstSessionAt
    ? (now.getTime() - snapshot.firstSessionAt.getTime()) / (7 * DAY_MS)
    : 0;
  const profile = strengthProfileFromSettings(settings, now);

  // Standards are bodyweight ratios, so a lift from when the user weighed
  // something else is scaled to today's bodyweight before it's compared
  // (issue #249): the ratio it showed then is what counts.
  const bodyweightNow = profile?.bodyweight ?? null;
  const scaled = (point: { date: Date; e1rm: number }): number => {
    const then = bodyweightAt(point.date);
    if (bodyweightNow == null || then == null || then <= 0) return point.e1rm;
    return (point.e1rm / then) * bodyweightNow;
  };

  const e1rmByLift: Partial<Record<StandardLift, number>> = {};
  for (const exercise of exercises) {
    const lift = standardLiftForSlug(exercise.slug);
    if (!lift) continue;
    const best = Math.max(0, ...e1rmSeries(snapshot.history, exercise.id).map(scaled));
    if (best > (e1rmByLift[lift] ?? 0)) e1rmByLift[lift] = best;
  }

  const level = inferExperience({ historyWeeks, e1rmByLift, profile });
  const liftsVsStandards = profile
    ? (Object.keys(e1rmByLift) as StandardLift[]).map((lift) => LIFT_LABELS[lift])
    : [];
  const explanation =
    liftsVsStandards.length > 0
      ? `Based on ${describeHistory(historyWeeks)} and your ${liftsVsStandards.join(", ")} vs. standards`
      : `Based on ${describeHistory(historyWeeks)}`;
  return { level, explanation };
}

export interface PlannedLift {
  exerciseId: string;
  /** Null until the lift has a session with RPE on every working set. */
  baselineE1rm: number | null;
  goalE1rm: number | null;
  goalDate: Date;
}

export interface BlockPlan {
  weeks: DprBlockWeeks;
  preset: DprPresetName;
  experience: ExperienceLevel;
  startedAt: Date;
  lifts: PlannedLift[];
}

export function planBlock(
  snapshot: DprSnapshot,
  options: {
    exerciseIds: readonly string[];
    weeks: DprBlockWeeks;
    preset: DprPresetName;
    experience: ExperienceLevel;
    now: Date;
    /** Next block (issue #215): the finished block's final e1RMs. */
    baselineOverrides?: ReadonlyMap<string, number>;
  },
): BlockPlan {
  const { weeks, preset, experience, now } = options;
  const lifts = options.exerciseIds.slice(0, DPR_MAX_FOCUS).map((exerciseId): PlannedLift => {
    const baseline =
      options.baselineOverrides?.get(exerciseId) ??
      baselineE1rm(e1rmSeries(snapshot.history, exerciseId), now);
    return {
      exerciseId,
      baselineE1rm: baseline,
      goalE1rm:
        baseline === null ? null : computeGoal(baseline, experience, DPR_PRESETS[preset], weeks),
      goalDate: new Date(now.getTime() + weeks * 7 * DAY_MS),
    };
  });
  return { weeks, preset, experience, startedAt: now, lifts };
}

function numeric(value: number | null): string | null {
  return value === null ? null : value.toFixed(2);
}

/**
 * Writes a new block and its focused lifts to Dexie (and the outbox).
 * Returns the block id. Settings (dprEnabled etc.) are the caller's to
 * patch — they go through /api/settings, not the outbox.
 */
export async function startDprBlock(
  userId: string,
  plan: BlockPlan,
  options: { programId?: string | null } = {},
  database: JimDatabase = db,
): Promise<string> {
  const deviceId = await getDeviceId(database);
  const now = new Date();
  const blockId = uuidv7();
  const block: DprBlockRow = {
    id: blockId,
    userId,
    startedAt: plan.startedAt,
    weeks: plan.weeks,
    endsAt: new Date(plan.startedAt.getTime() + plan.weeks * 7 * DAY_MS),
    status: "active",
    aggressiveness: plan.preset,
    experience: plan.experience,
    programId: options.programId ?? null,
    createdAt: now,
    updatedAt: now,
    deviceId,
    deletedAt: null,
    serverSeq: 0,
  };
  await mutate("dprBlocks", block, database);
  for (const [position, lift] of plan.lifts.entries()) {
    await mutate(
      "dprBlockLifts",
      {
        id: uuidv7(),
        userId,
        blockId,
        exerciseId: lift.exerciseId,
        position,
        baselineE1rm: numeric(lift.baselineE1rm),
        goalE1rm: numeric(lift.goalE1rm),
        updatedAt: now,
        deviceId,
        deletedAt: null,
        serverSeq: 0,
      },
      database,
    );
  }
  return blockId;
}

/**
 * Mid-block focus change: tombstones lifts no longer picked, adds new ones
 * (baseline and goal computed as of now, at the block's own snapshot
 * preset/experience), and renumbers positions to the new order.
 */
export async function updateBlockFocus(
  block: DprBlockRow,
  existing: readonly DprBlockLiftRow[],
  exerciseIds: readonly string[],
  snapshot: DprSnapshot,
  database: JimDatabase = db,
): Promise<void> {
  const deviceId = await getDeviceId(database);
  const now = new Date();
  const wanted = exerciseIds.slice(0, DPR_MAX_FOCUS);
  const byExercise = new Map(existing.map((lift) => [lift.exerciseId, lift]));

  for (const lift of existing) {
    if (!wanted.includes(lift.exerciseId)) {
      await mutate(
        "dprBlockLifts",
        { ...lift, deletedAt: now, updatedAt: now, deviceId },
        database,
      );
    }
  }

  for (const [position, exerciseId] of wanted.entries()) {
    const current = byExercise.get(exerciseId);
    if (current) {
      if (current.position !== position) {
        await mutate("dprBlockLifts", { ...current, position, updatedAt: now, deviceId }, database);
      }
      continue;
    }
    const baseline = baselineE1rm(e1rmSeries(snapshot.history, exerciseId), now);
    const goal =
      baseline === null
        ? null
        : computeGoal(baseline, block.experience, DPR_PRESETS[block.aggressiveness], block.weeks);
    await mutate(
      "dprBlockLifts",
      {
        id: uuidv7(),
        userId: block.userId,
        blockId: block.id,
        exerciseId,
        position,
        baselineE1rm: numeric(baseline),
        goalE1rm: numeric(goal),
        updatedAt: now,
        deviceId,
        deletedAt: null,
        serverSeq: 0,
      },
      database,
    );
  }
}

const DPR_PROMPT_MIN_SESSIONS = 6;

/** The one-time "Try DPR" card: 6+ completed sessions, DPR off, not dismissed. */
export function shouldShowDprPrompt(
  settings: Pick<SettingsRow, "dprEnabled" | "dprPromptDismissedAt">,
  completedSessionCount: number,
): boolean {
  return (
    !settings.dprEnabled &&
    settings.dprPromptDismissedAt === null &&
    completedSessionCount >= DPR_PROMPT_MIN_SESSIONS
  );
}

/** The most recently started block that's finished — the next block prefills from it. */
export function lastCompletedBlock(blocks: readonly DprBlockRow[]): DprBlockRow | null {
  return (
    blocks
      .filter((block) => !block.deletedAt && block.status === "completed")
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0] ?? null
  );
}

async function updateBlock(
  block: DprBlockRow,
  patch: Partial<Pick<DprBlockRow, "status" | "endsAt">>,
  database: JimDatabase,
) {
  const deviceId = await getDeviceId(database);
  await mutate("dprBlocks", { ...block, ...patch, updatedAt: new Date(), deviceId }, database);
}

/** Optional deload week after a block (issue #215): 7 days of −10% calls. */
export async function startDeloadWeek(block: DprBlockRow, database: JimDatabase = db) {
  const now = new Date();
  await updateBlock(
    block,
    { status: "deload", endsAt: new Date(now.getTime() + DPR_DELOAD_WEEK_DAYS * DAY_MS) },
    database,
  );
}

export async function completeBlock(block: DprBlockRow, database: JimDatabase = db) {
  await updateBlock(block, { status: "completed" }, database);
}

/** "End block early": the recap shows from now. */
export async function endBlockNow(block: DprBlockRow, database: JimDatabase = db) {
  await updateBlock(block, { endsAt: new Date() }, database);
}
