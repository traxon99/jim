import { describe, expect, it } from "vitest";
import type { DprSession, DprSet } from "../../dpr/decide";
import {
  type ProgressionRule,
  type RoutineTargets,
  customRuleConflict,
  decideProgression,
  parseProgressionRule,
  progressionSystemFor,
} from "../rules";

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n));

function working(weight: number, reps: number): DprSet {
  return { kind: "working", weight, reps, rpe: null };
}
/** One session: a working set per entry in `reps`, all at `weight`. */
function session(n: number, weight: number, reps: number[]): DprSession {
  return { date: day(n), sets: reps.map((r) => working(weight, r)) };
}

/**
 * Replays a program one session at a time: each session is lifted at the
 * weight and scheme the rule asked for, with `reps(sets, reps)` saying what
 * the lifter got. Returns what the rule asked for before each session.
 */
function simulate(
  rule: ProgressionRule,
  target: RoutineTargets,
  start: number,
  performances: ((sets: number, reps: number) => number[])[],
) {
  const history: DprSession[] = [];
  const asked: string[] = [];
  for (const [i, perform] of performances.entries()) {
    const call = decideProgression({ rule, sessions: history, target, fallbackWeight: start });
    const sets = call.targetSets ?? 1;
    const reps = call.targetReps ?? 1;
    asked.push(`${sets}×${reps} @ ${call.weight}`);
    history.push(session(i * 3, call.weight as number, perform(sets, reps)));
  }
  const next = decideProgression({ rule, sessions: history, target, fallbackWeight: start });
  asked.push(`${next.targetSets}×${next.targetReps} @ ${next.weight}`);
  return asked;
}

const hit = (sets: number, reps: number) => Array.from({ length: sets }, () => reps);
const missLast = (sets: number, reps: number) => [...hit(sets - 1, reps), reps - 1];

describe("GZCLP over 4 simulated weeks (issue #255)", () => {
  // 4 weeks at 3 days a week is 12 workouts of the A1/B1/A2/B2 rotation, so
  // each lift comes up as T1 3 times and as T2 3 times; these run each tier
  // through 6–8 exposures to cover every stage change and the reset.
  it("T1: 5×3 → 6×2 → 10×1 on a miss, then deloads 15% back to 5×3", () => {
    const t1: ProgressionRule = {
      type: "linear",
      increment: 10,
      stages: [
        { sets: 5, reps: 3 },
        { sets: 6, reps: 2 },
        { sets: 10, reps: 1 },
      ],
      deload: { afterFailures: 1, pct: 0.15 },
    };
    const target = { targetSets: 5, targetRepsLow: 3, targetRepsHigh: 3 };
    const asked = simulate(t1, target, 200, [
      hit,
      missLast,
      hit,
      missLast,
      hit,
      (sets) => [...hit(sets - 2, 1), 0, 0].filter((r) => r > 0),
      hit,
    ]);
    expect(asked).toEqual([
      "5×3 @ 200",
      "5×3 @ 210",
      "6×2 @ 210",
      "6×2 @ 220",
      "10×1 @ 220",
      "10×1 @ 230",
      // 230 × 0.85 = 195.5, rounded down to the 10 lb step.
      "5×3 @ 190",
      "5×3 @ 200",
    ]);
  });

  it("T2: 3×10 → 3×8 → 3×6, then deloads back to 3×10", () => {
    const t2: ProgressionRule = {
      type: "linear",
      increment: 5,
      stages: [
        { sets: 3, reps: 10 },
        { sets: 3, reps: 8 },
        { sets: 3, reps: 6 },
      ],
      deload: { afterFailures: 1, pct: 0.15 },
    };
    const target = { targetSets: 3, targetRepsLow: 10, targetRepsHigh: 10 };
    const asked = simulate(t2, target, 100, [hit, hit, missLast, hit, missLast, missLast, hit]);
    expect(asked).toEqual([
      "3×10 @ 100",
      "3×10 @ 105",
      "3×10 @ 110",
      "3×8 @ 110",
      "3×8 @ 115",
      "3×6 @ 115",
      "3×10 @ 95",
      "3×10 @ 100",
    ]);
  });

  it("T3: 3×15+ goes up once the reps add up to 55 (25 on the AMRAP set)", () => {
    const t3: ProgressionRule = { type: "reps_sum", increment: 5, repsSumTarget: 55 };
    const target = { targetSets: 3, targetRepsLow: 15, targetRepsHigh: 15 };
    const amrap = (last: number) => () => [15, 15, last];
    const asked = simulate(t3, target, 50, [amrap(20), amrap(25), amrap(18), amrap(22), amrap(26)]);
    expect(asked).toEqual([
      "3×15 @ 50",
      "3×15 @ 50",
      "3×15 @ 55",
      "3×15 @ 55",
      "3×15 @ 55",
      "3×15 @ 60",
    ]);
  });
});

describe("decideProgression", () => {
  const target = { targetSets: 3, targetRepsLow: 8, targetRepsHigh: 12 };

  it("uses the fallback weight with no history", () => {
    const call = decideProgression({
      rule: { type: "linear", increment: 5 },
      sessions: [],
      target,
      fallbackWeight: 95,
    });
    expect(call).toMatchObject({ call: "insufficient", weight: 95, targetReps: 8, targetSets: 3 });
  });

  it("double progression adds a rep at a time, then weight at the top", () => {
    const rule: ProgressionRule = { type: "double", increment: 5 };
    const hold = decideProgression({ rule, sessions: [session(0, 50, [10, 9, 9])], target });
    expect(hold).toMatchObject({ call: "hold", weight: 50, targetReps: 10 });
    const up = decideProgression({ rule, sessions: [session(0, 50, [12, 12, 12])], target });
    expect(up).toMatchObject({ call: "increase", weight: 55, targetReps: 8 });
  });

  it("deloads after N failures in a row and resets the count on a non-failure", () => {
    const rule: ProgressionRule = {
      type: "double",
      increment: 5,
      deload: { afterFailures: 2, pct: 0.1 },
    };
    const once = decideProgression({
      rule,
      sessions: [
        session(0, 100, [7, 7, 6]),
        session(2, 100, [9, 9, 9]),
        session(4, 100, [7, 6, 6]),
      ],
      target,
      loadStep: 2.5,
    });
    expect(once).toMatchObject({ call: "hold", weight: 100, streak: 1 });
    const twice = decideProgression({
      rule,
      sessions: [session(0, 100, [7, 7, 6]), session(2, 100, [7, 6, 6])],
      target,
      loadStep: 2.5,
    });
    expect(twice).toMatchObject({ call: "deload", weight: 90, previousWeight: 100 });
  });

  it("builds on an overridden weight and ignores light sessions", () => {
    const rule: ProgressionRule = { type: "linear", increment: 5 };
    const call = decideProgression({
      rule,
      sessions: [
        session(0, 100, [8, 8, 8]),
        session(2, 120, [8, 8, 8]),
        { ...session(4, 60, [8, 8, 8]), intensity: "light" },
      ],
      target,
    });
    expect(call).toMatchObject({ call: "increase", weight: 125, previousWeight: 120 });
  });

  it("only judges working sets at the top weight", () => {
    const call = decideProgression({
      rule: { type: "linear", increment: 5 },
      sessions: [
        {
          date: day(0),
          sets: [
            { kind: "warmup", weight: 45, reps: 3, rpe: null },
            working(80, 8),
            working(100, 8),
            working(100, 8),
            working(100, 8),
          ],
        },
      ],
      target,
    });
    expect(call).toMatchObject({ call: "increase", weight: 105 });
  });
});

describe("parseProgressionRule", () => {
  it("accepts a valid rule and drops options its type doesn't use", () => {
    expect(
      parseProgressionRule({
        type: "double",
        increment: 2.5,
        stages: [{ sets: 3, reps: 5 }],
        repsSumTarget: 40,
        deload: { afterFailures: 3, pct: 0.1 },
      }),
    ).toEqual({
      type: "double",
      increment: 2.5,
      stages: null,
      repsSumTarget: null,
      deload: { afterFailures: 3, pct: 0.1 },
    });
  });

  it.each([
    null,
    "linear",
    { type: "wave", increment: 5 },
    { type: "linear", increment: 0 },
    { type: "linear", increment: 5, stages: [{ sets: 3 }] },
    { type: "linear", increment: 5, deload: { afterFailures: 2, pct: 1.5 } },
  ])("rejects %j", (value) => {
    expect(parseProgressionRule(value)).toBeNull();
  });
});

describe("one automatic system per lift (ADR-016)", () => {
  const rule: ProgressionRule = { type: "linear", increment: 5 };

  it("a custom rule beats DPR focus", () => {
    expect(progressionSystemFor({ rule, dprFocused: true })).toBe("custom");
    expect(progressionSystemFor({ rule: null, dprFocused: true })).toBe("dpr");
    expect(progressionSystemFor({ rule: null, dprFocused: false })).toBe("none");
  });

  it("refuses a rule on a DPR-focused lift", () => {
    expect(customRuleConflict({ dprFocused: true })).toMatch(/DPR/);
    expect(customRuleConflict({ dprFocused: false })).toBeNull();
  });
});
