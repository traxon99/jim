import type {
  DprBlockLiftRow,
  DprBlockRow,
  ExerciseRow,
  InjuryRow,
  RoutineExerciseRow,
  RoutineRow,
  SessionExerciseRow,
  SessionRow,
  SetRow,
  SettingsRow,
} from "@/lib/db/schema";
import { currentBlock, liveBlockLifts } from "@/lib/dpr/block-select";
import { type DprContext, buildDprContext, liftGoal } from "@/lib/dpr/calls";
import { defaultRepRange } from "@/lib/dpr/data";
import {
  type DprBlockRecapSummary,
  type DprLiftRecap,
  blockEffectiveEnd,
  blockHasEnded,
  blockRecapSummary,
  buildDprSnapshot,
  liftRecap,
} from "@jim/core";

/**
 * What the desktop PRP section (issue #470) reads: the synced rows the
 * phone's /progression screen derives everything from. Dates cross to the
 * browser as Dates (server components serialize them), and the calls are
 * made there with the same functions the phone uses.
 */
export interface PortalProgressionData {
  settings: SettingsRow;
  blocks: DprBlockRow[];
  lifts: DprBlockLiftRow[];
  exercises: ExerciseRow[];
  sessions: SessionRow[];
  sessionExercises: SessionExerciseRow[];
  sets: SetRow[];
  routines: RoutineRow[];
  routineExercises: RoutineExerciseRow[];
  /** Injuries bend PRP's calls as on the phone (issue #627). */
  injuries?: InjuryRow[];
}

export interface PortalBlockRecap {
  block: DprBlockRow;
  recaps: DprLiftRecap[];
  summary: DprBlockRecapSummary;
}

export type PortalProgressionView =
  | { kind: "none"; pastBlocks: PortalBlockRecap[] }
  | {
      kind: "running";
      context: DprContext;
      blockLifts: DprBlockLiftRow[];
      effectiveEnd: Date;
      pastBlocks: PortalBlockRecap[];
    }
  | {
      kind: "ended";
      context: DprContext;
      recap: PortalBlockRecap;
      pastBlocks: PortalBlockRecap[];
    };

function recapFor(
  block: DprBlockRow,
  lifts: readonly DprBlockLiftRow[],
  snapshot: DprContext["snapshot"],
  end: Date,
): PortalBlockRecap {
  const recaps = liveBlockLifts(lifts, block.id).map((lift) =>
    liftRecap(snapshot, lift.exerciseId, block, liftGoal(lift), end),
  );
  return { block, recaps, summary: blockRecapSummary(recaps) };
}

/**
 * The phone's /progression screen, minus its buttons: the running block's
 * lifts and calls, or the recap of one that just ended, plus every finished
 * block's recap, newest first.
 */
export function buildProgressionView(
  data: PortalProgressionData,
  now: Date,
): PortalProgressionView {
  const snapshot = buildDprSnapshot(data, defaultRepRange(data.settings));
  const pastBlocks = data.blocks
    .filter((block) => !block.deletedAt && block.status === "completed")
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    .map((block) => recapFor(block, data.lifts, snapshot, block.endsAt));

  const block = currentBlock(data.blocks);
  // Shown even with PRP switched off on the phone, as /progression does.
  const context = block
    ? buildDprContext({
        settings: { ...data.settings, dprEnabled: true },
        blocks: data.blocks,
        lifts: data.lifts,
        exercises: data.exercises,
        snapshot,
        injuries: data.injuries,
        now,
      })
    : null;
  if (!block || !context) return { kind: "none", pastBlocks };

  const blockLifts = liveBlockLifts(data.lifts, block.id);
  const liftIds = blockLifts.map((lift) => lift.exerciseId);
  const effectiveEnd = blockEffectiveEnd(block, snapshot, liftIds, now);
  if (blockHasEnded(block, snapshot, liftIds, now)) {
    return {
      kind: "ended",
      context,
      recap: recapFor(block, data.lifts, snapshot, effectiveEnd),
      pastBlocks,
    };
  }
  return { kind: "running", context, blockLifts, effectiveEnd, pastBlocks };
}
