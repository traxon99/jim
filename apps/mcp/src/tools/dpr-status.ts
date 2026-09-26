import {
  type DprBlockInfo,
  type DprPresetName,
  type DprSourceRows,
  type ExperienceLevel,
  type IncrementOverrides,
  blockEffectiveEnd,
  blockHasEnded,
  buildDprSnapshot,
  callForLift,
  currentBlockOf,
  liftDecisionLog,
  liftProgress,
  liftRepRanges,
} from "@jim/core";
import {
  dprBlockLifts,
  dprBlocks,
  exercises,
  routineExercises,
  routines,
  sessionExercises,
  sessions,
  sets,
  users,
} from "@jim/db";
import { eq, inArray } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUser } from "../context.js";

const RECENT_DECISIONS = 5;

export interface DprStatusInput {
  user: {
    units: "lb" | "kg";
    dprEnabled: boolean;
    dprAggressiveness: DprPresetName;
    dprExperience: ExperienceLevel | null;
    dprEquipmentIncrements: Record<string, Record<string, number>>;
    dprDefaultRepLow: number;
    dprDefaultRepHigh: number;
  };
  blocks: readonly (DprBlockInfo & {
    id: string;
    aggressiveness: DprPresetName;
    experience: ExperienceLevel;
    deletedAt: Date | null;
  })[];
  lifts: readonly {
    blockId: string;
    exerciseId: string;
    position: number;
    baselineE1rm: string | null;
    goalE1rm: string | null;
    deletedAt: Date | null;
  }[];
  exercises: readonly { id: string; name: string; equipment: string | null }[];
  rows: DprSourceRows;
  now: Date;
}

function numberOrNull(value: string | null): number | null {
  return value === null ? null : Number(value);
}

const round = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

/**
 * The same DPR picture the web app's /progression page shows (issue #218),
 * computed with the same pure @jim/core functions from the same rows.
 */
export function dprStatusFromRows(input: DprStatusInput) {
  const { user, now } = input;
  const defaultRange = { low: user.dprDefaultRepLow, high: user.dprDefaultRepHigh };
  const settings = {
    units: user.units,
    aggressiveness: user.dprAggressiveness,
    increments: user.dprEquipmentIncrements as IncrementOverrides,
    defaultRange,
  };
  const snapshot = buildDprSnapshot(input.rows, defaultRange);
  const block = currentBlockOf(input.blocks);
  const exerciseById = new Map(input.exercises.map((e) => [e.id, e]));

  const lifts = block
    ? input.lifts
        .filter((lift) => lift.blockId === block.id && !lift.deletedAt)
        .sort((a, b) => a.position - b.position)
    : [];
  const liftIds = lifts.map((lift) => lift.exerciseId);

  return {
    enabled: user.dprEnabled,
    preset: user.dprAggressiveness,
    experience: user.dprExperience,
    units: user.units,
    block: block && {
      startedAt: block.startedAt.toISOString(),
      weeks: block.weeks,
      endsAt: block.endsAt.toISOString(),
      effectiveEndsAt: blockEffectiveEnd(block, snapshot, liftIds, now).toISOString(),
      status: block.status,
      ended: blockHasEnded(block, snapshot, liftIds, now),
      goalsSetFor: { preset: block.aggressiveness, experience: block.experience },
    },
    lifts: lifts.map((lift) => {
      const exercise = exerciseById.get(lift.exerciseId);
      const goal = {
        baselineE1rm: numberOrNull(lift.baselineE1rm),
        goalE1rm: numberOrNull(lift.goalE1rm),
      };
      const { decision, repRange } = callForLift({
        snapshot,
        exerciseId: lift.exerciseId,
        equipment: exercise?.equipment,
        settings,
        block,
        now,
      });
      const progress = block
        ? liftProgress(snapshot, lift.exerciseId, block, goal, now)
        : { currentE1rm: null, status: null };
      const log = liftDecisionLog({
        snapshot,
        exerciseId: lift.exerciseId,
        equipment: exercise?.equipment,
        settings,
        now,
      });
      return {
        exercise: { id: lift.exerciseId, name: exercise?.name ?? null },
        repRanges: liftRepRanges(snapshot, lift.exerciseId),
        nextCall: {
          call: decision.call,
          weight: decision.weight,
          reason: decision.reason,
          repRange,
        },
        e1rm: {
          baseline: round(goal.baselineE1rm),
          current: round(progress.currentE1rm),
          goal: round(goal.goalE1rm),
        },
        status: progress.status,
        recentDecisions: log.slice(0, RECENT_DECISIONS).map((entry) => ({
          after: entry.sessionDate.toISOString(),
          repRange: entry.repRange,
          call: entry.decision.call,
          from: entry.decision.previousWeight,
          weight: entry.decision.weight,
          reason: entry.decision.reason,
        })),
      };
    }),
  };
}

/** Read-only: loads the user's DPR config and history under RLS, writes nothing. */
export async function dprStatus(context: UserContext) {
  return withUser(context, async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, context.userId));
    if (!user) throw new Error("No settings row for this user yet — open Jim once first.");

    // One transaction, so one query at a time.
    const blockRows = await tx.select().from(dprBlocks);
    const liftRows = await tx.select().from(dprBlockLifts);
    const sessionRows = await tx.select().from(sessions);
    const sessionExerciseRows = await tx.select().from(sessionExercises);
    const setRows = await tx.select().from(sets);
    const routineRows = await tx.select().from(routines);
    const itemRows = await tx.select().from(routineExercises);
    const exerciseIds = [...new Set(liftRows.map((lift) => lift.exerciseId))];
    const exerciseRows = exerciseIds.length
      ? await tx
          .select({ id: exercises.id, name: exercises.name, equipment: exercises.equipment })
          .from(exercises)
          .where(inArray(exercises.id, exerciseIds))
      : [];

    return dprStatusFromRows({
      user,
      blocks: blockRows,
      lifts: liftRows,
      exercises: exerciseRows,
      rows: {
        sessions: sessionRows,
        sessionExercises: sessionExerciseRows,
        sets: setRows,
        routines: routineRows,
        routineExercises: itemRows,
      },
      now: new Date(),
    });
  });
}
