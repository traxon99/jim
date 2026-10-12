import type {
  DprBlockLiftRow,
  DprBlockRow,
  ExerciseRow,
  SessionExerciseRow,
  SessionRow,
  SetRow,
} from "@/lib/db/schema";
import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";
import { describe, expect, it } from "vitest";
import { type PortalProgressionData, buildProgressionView } from "../progression-data";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-12T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * DAY_MS);

function block(overrides: Partial<DprBlockRow>): DprBlockRow {
  return {
    id: "block",
    userId: "u",
    startedAt: daysAgo(20),
    weeks: 8,
    endsAt: new Date(daysAgo(20).getTime() + 56 * DAY_MS),
    status: "active",
    aggressiveness: "moderate",
    experience: "intermediate",
    volumeMode: false,
    programId: null,
    createdAt: daysAgo(20),
    updatedAt: daysAgo(20),
    deviceId: "d",
    deletedAt: null,
    serverSeq: 0,
    ...overrides,
  };
}

function lift(blockId: string): DprBlockLiftRow {
  return {
    id: `lift-${blockId}`,
    userId: "u",
    blockId,
    exerciseId: "bench",
    position: 0,
    baselineE1rm: "200",
    goalE1rm: "220",
    updatedAt: daysAgo(20),
    deviceId: "d",
    deletedAt: null,
    serverSeq: 0,
  };
}

/** One 3×8 bench session `days` ago at `weight`. */
function session(days: number, weight: number) {
  const id = `s${days}`;
  const startedAt = daysAgo(days);
  return {
    session: {
      id,
      routineId: null,
      startedAt,
      endedAt: new Date(startedAt.getTime() + 3_600_000),
      deletedAt: null,
      intensity: null,
    } as SessionRow,
    sessionExercise: {
      id: `se${days}`,
      sessionId: id,
      exerciseId: "bench",
      deletedAt: null,
    } as SessionExerciseRow,
    sets: [0, 1, 2].map(
      (i) =>
        ({
          id: `${id}-${i}`,
          sessionExerciseId: `se${days}`,
          setIndex: i,
          kind: "working",
          weight: String(weight),
          reps: 8,
          rpe: "8",
          completedAt: startedAt,
          supersedesId: null,
          deletedAt: null,
        }) as SetRow,
    ),
  };
}

function data(
  blocks: DprBlockRow[],
  sessions = [session(100, 165), session(3, 185)],
): PortalProgressionData {
  return {
    settings: { ...DEFAULT_SETTINGS, dprEnabled: true },
    blocks,
    lifts: blocks.map((b) => lift(b.id)),
    exercises: [
      {
        id: "bench",
        name: "Bench",
        slug: "bench",
        equipment: "barbell",
        trackingType: "weight_reps",
        primaryMuscles: ["chest"],
        secondaryMuscles: [],
      } as unknown as ExerciseRow,
    ],
    sessions: sessions.map((s) => s.session),
    sessionExercises: sessions.map((s) => s.sessionExercise),
    sets: sessions.flatMap((s) => s.sets),
    routines: [],
    routineExercises: [],
  };
}

describe("buildProgressionView", () => {
  it("is empty with no block, and still lists finished ones", () => {
    const view = buildProgressionView(
      data([
        block({ id: "old", status: "completed", startedAt: daysAgo(120), endsAt: daysAgo(64) }),
      ]),
      now,
    );
    expect(view.kind).toBe("none");
    expect(view.pastBlocks).toHaveLength(1);
    expect(view.pastBlocks[0]?.recaps[0]?.exerciseId).toBe("bench");
  });

  it("shows a running block's lifts with a call for each", () => {
    const view = buildProgressionView(data([block({})]), now);
    if (view.kind !== "running") throw new Error(`expected running, got ${view.kind}`);
    expect(view.blockLifts.map((l) => l.exerciseId)).toEqual(["bench"]);
    expect(view.context.block.id).toBe("block");
  });

  it("shows the recap once the block's time is up", () => {
    const view = buildProgressionView(
      data(
        [block({ startedAt: daysAgo(70), endsAt: daysAgo(14) })],
        [65, 58, 51, 44, 37, 30, 23, 16].map((days, i) => session(days, 165 + i * 5)),
      ),
      now,
    );
    expect(view.kind).toBe("ended");
  });
});
