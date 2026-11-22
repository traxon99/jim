import { describe, expect, it } from "vitest";
import {
  PACE_EXERCISE_TRANSITION_SECONDS,
  PACE_WORKOUT_SETUP_SECONDS,
  PACE_WORK_SECONDS_PER_SET,
  computePace,
} from "../pace";
import { type PaceHistorySession, calibratePace, exerciseOverlap } from "../pace-history";

const day = (n: number) => new Date(Date.UTC(2026, 10, n, 18));
const offset = (start: Date, seconds: number) => new Date(start.getTime() + seconds * 1000);

/**
 * A past workout where every exercise has `sets` sets with `rest` between
 * them, each set taking `work` seconds past its rest, `setup` before the
 * first set and `transition` extra at each switch.
 */
function pastWorkout(
  startedAt: Date,
  exerciseIds: readonly string[],
  { setup = 300, work = 80, transition = 200, rest = 120, sets = 3 } = {},
): PaceHistorySession {
  let clock = 0;
  return {
    startedAt,
    exercises: exerciseIds.map((exerciseId, index) => ({
      exerciseId,
      inSuperset: false,
      sets: Array.from({ length: sets }, (_, setIndex) => {
        if (setIndex === 0) clock += index === 0 ? setup : rest + transition;
        else clock += rest;
        clock += work;
        return {
          completedAt: offset(startedAt, clock),
          restTargetSeconds: index === 0 && setIndex === 0 ? null : rest,
        };
      }),
    })),
  };
}

const ROUTINE = ["squat", "bench", "row"];

describe("calibratePace", () => {
  it("returns null without history", () => {
    expect(calibratePace({ currentExerciseIds: ROUTINE, history: [] })).toBeNull();
  });

  it("learns setup, per-set and switch times from enough past workouts", () => {
    const history = [1, 2, 3, 4].map((n) => pastWorkout(day(n), ROUTINE));
    const calibration = calibratePace({ currentExerciseIds: ROUTINE, history });
    expect(calibration?.setupSeconds).toBe(300);
    expect(calibration?.workSecondsPerSet).toBe(80);
    expect(calibration?.workSecondsByExerciseId.get("squat")).toBe(80);
    expect(calibration?.transitionSeconds).toBe(200);
    expect(calibration?.sessionsUsed).toBe(4);
  });

  it("blends a single past workout with the defaults", () => {
    const calibration = calibratePace({
      currentExerciseIds: ROUTINE,
      history: [pastWorkout(day(1), ROUTINE)],
    });
    // One workout's transitions weigh 2 of the 3 needed for full confidence.
    const expected = Math.round((2 / 3) * 200 + (1 / 3) * PACE_EXERCISE_TRANSITION_SECONDS);
    expect(calibration?.transitionSeconds).toBe(expected);
    expect(calibration?.setupSeconds).toBeGreaterThan(PACE_WORKOUT_SETUP_SECONDS);
    expect(calibration?.setupSeconds).toBeLessThan(300);
  });

  it("keeps per-exercise times but ignores setup and switches from a very different routine", () => {
    const history = [1, 2, 3, 4].map((n) =>
      pastWorkout(day(n), ["squat", "curl", "dip", "lunge"], { transition: 900 }),
    );
    const calibration = calibratePace({ currentExerciseIds: ROUTINE, history });
    expect(calibration?.transitionSeconds).toBe(PACE_EXERCISE_TRANSITION_SECONDS);
    expect(calibration?.setupSeconds).toBe(PACE_WORKOUT_SETUP_SECONDS);
    expect(calibration?.workSecondsByExerciseId.get("squat")).toBe(80);
    expect(calibration?.workSecondsByExerciseId.has("bench")).toBe(false);
  });

  it("measures against the rest the timer ran, so a new rest still moves the plan", () => {
    const history = [1, 2, 3, 4].map((n) => pastWorkout(day(n), ROUTINE, { rest: 60 }));
    const calibration = calibratePace({ currentExerciseIds: ROUTINE, history });
    expect(calibration?.workSecondsPerSet).toBe(80);
  });

  it("skips breaks and superset gaps", () => {
    const base = pastWorkout(day(1), ["squat"], { sets: 3 });
    const squat = base.exercises[0];
    if (!squat) throw new Error("fixture");
    const third = squat.sets[2];
    if (!third) throw new Error("fixture");
    const withBreak: PaceHistorySession = {
      ...base,
      exercises: [
        {
          ...squat,
          sets: [
            ...squat.sets.slice(0, 2),
            { ...third, completedAt: offset(third.completedAt, 3600) },
          ],
        },
        {
          exerciseId: "curl",
          inSuperset: true,
          sets: [{ completedAt: offset(base.startedAt, 30), restTargetSeconds: 10 }],
        },
      ],
    };
    const calibration = calibratePace({
      currentExerciseIds: ["squat"],
      history: Array.from({ length: 6 }, () => withBreak).map((s, i) => ({
        ...s,
        startedAt: day(i + 1),
        exercises: s.exercises.map((e) => ({
          ...e,
          sets: e.sets.map((set) => ({
            ...set,
            completedAt: offset(
              day(i + 1),
              (set.completedAt.getTime() - base.startedAt.getTime()) / 1000,
            ),
          })),
        })),
      })),
    });
    expect(calibration?.workSecondsByExerciseId.get("squat")).toBe(80);
  });

  it("feeds the learned budgets into the pace plan", () => {
    const history = [1, 2, 3, 4].map((n) => pastWorkout(day(n), ROUTINE));
    const calibration = calibratePace({ currentExerciseIds: ROUTINE, history });
    const start = day(10);
    const pace = computePace({
      startedAt: start,
      now: start,
      calibration,
      exercises: ROUTINE.map((exerciseId) => ({
        exerciseId,
        targetSetCount: 3,
        restSeconds: 120,
        setCompletedAt: [],
      })),
    });
    // 300 setup + 80, then 2 × (120 + 80), then 2 × (120 + 200 + 80 + 2 × (120 + 80)).
    expect(pace?.plannedTotalSeconds).toBe(380 + 400 + 2 * (400 + 400));
    const fixed = computePace({
      startedAt: start,
      now: start,
      exercises: ROUTINE.map(() => ({ targetSetCount: 3, restSeconds: 120, setCompletedAt: [] })),
    });
    expect(fixed?.plannedTotalSeconds).toBe(
      PACE_WORKOUT_SETUP_SECONDS +
        9 * PACE_WORK_SECONDS_PER_SET +
        8 * 120 +
        2 * PACE_EXERCISE_TRANSITION_SECONDS,
    );
  });
});

describe("exerciseOverlap", () => {
  it("is the share of exercises in common", () => {
    expect(exerciseOverlap(["a", "b"], ["a", "b"])).toBe(1);
    expect(exerciseOverlap(["a", "b"], ["a", "c"])).toBeCloseTo(1 / 3);
    expect(exerciseOverlap(["a"], ["b"])).toBe(0);
  });
});
