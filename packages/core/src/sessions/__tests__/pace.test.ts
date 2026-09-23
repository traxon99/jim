import { describe, expect, it } from "vitest";
import {
  PACE_DEFAULT_UNPLANNED_SETS,
  PACE_EXERCISE_TRANSITION_SECONDS,
  PACE_WORKOUT_SETUP_SECONDS,
  PACE_WORK_SECONDS_PER_SET,
  computePace,
} from "../pace";

const start = new Date("2026-09-23T18:00:00Z");
const at = (seconds: number) => new Date(start.getTime() + seconds * 1000);

const SETUP = PACE_WORKOUT_SETUP_SECONDS;
const WORK = PACE_WORK_SECONDS_PER_SET;
const SWITCH = PACE_EXERCISE_TRANSITION_SECONDS;

describe("computePace", () => {
  it("returns null with no exercises", () => {
    expect(computePace({ startedAt: start, now: start, exercises: [] })).toBeNull();
  });

  it("budgets setup, work, rest and exercise transitions into the plan", () => {
    const pace = computePace({
      startedAt: start,
      now: start,
      exercises: [
        { targetSetCount: 2, restSeconds: 120, setCompletedAt: [] },
        { targetSetCount: 1, restSeconds: 60, setCompletedAt: [] },
      ],
    });
    expect(pace?.plan.map((p) => p.seconds)).toEqual([
      0,
      SETUP + WORK,
      SETUP + WORK + 120 + WORK,
      SETUP + WORK + 120 + WORK + 120 + SWITCH + WORK,
    ]);
    expect(pace?.setsPlanned).toBe(3);
    expect(pace?.status).toBe("on-pace");
  });

  it("assumes a default set count for exercises without a target", () => {
    const pace = computePace({
      startedAt: start,
      now: start,
      exercises: [{ targetSetCount: null, restSeconds: 90, setCompletedAt: [] }],
    });
    expect(pace?.setsPlanned).toBe(PACE_DEFAULT_UNPLANNED_SETS);
  });

  it("doesn't count resting against the lifter until the planned gap runs out", () => {
    const exercises = [{ targetSetCount: 3, restSeconds: 120, setCompletedAt: [at(SETUP + WORK)] }];
    const midRest = computePace({ startedAt: start, now: at(SETUP + WORK + 150), exercises });
    expect(midRest?.deltaSeconds).toBe(0);
    expect(midRest?.overdue).toBe(false);

    const late = computePace({
      startedAt: start,
      now: at(SETUP + WORK + 120 + WORK + 300),
      exercises,
    });
    expect(late?.deltaSeconds).toBe(300);
    expect(late?.overdue).toBe(true);
    expect(late?.status).toBe("behind");
  });

  it("flags skipping rests as ahead rather than rewarding it", () => {
    const pace = computePace({
      startedAt: start,
      now: at(120),
      exercises: [
        { targetSetCount: 4, restSeconds: 180, setCompletedAt: [at(30), at(60), at(90), at(115)] },
        { targetSetCount: 3, restSeconds: 180, setCompletedAt: [] },
      ],
    });
    expect(pace?.status).toBe("ahead");
    expect(pace?.deltaSeconds).toBeLessThan(0);
  });

  it("extends the plan for extra sets instead of reading them as behind", () => {
    const pace = computePace({
      startedAt: start,
      now: at(SETUP + WORK + 90 + WORK),
      exercises: [
        {
          targetSetCount: 1,
          restSeconds: 90,
          setCompletedAt: [at(SETUP + WORK), at(SETUP + WORK + 90 + WORK)],
        },
      ],
    });
    expect(pace?.setsPlanned).toBe(2);
    expect(pace?.deltaSeconds).toBe(0);
    expect(pace?.status).toBe("done");
  });

  it("projects the finish from the plan plus current drift", () => {
    const pace = computePace({
      startedAt: start,
      now: at(SETUP + WORK + 60 + WORK + 200),
      exercises: [{ targetSetCount: 3, restSeconds: 60, setCompletedAt: [at(SETUP + WORK)] }],
    });
    expect(pace?.projectedTotalSeconds).toBe((pace?.plannedTotalSeconds ?? 0) + 200);
  });
});
