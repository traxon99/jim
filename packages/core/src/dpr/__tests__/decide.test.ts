import { describe, expect, it } from "vitest";
import {
  type DprSession,
  type DprSet,
  decideNextWeight,
  decisionLog,
  dprStateKey,
  resolveRepRange,
  sessionsForKey,
} from "../decide";
import { DPR_PRESETS, type DprPresetName } from "../presets";

const range = { low: 6, high: 8 };
const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n));

function working(weight: number, reps: number, rpe: number | null = 7): DprSet {
  return { kind: "working", weight, reps, rpe };
}
function session(n: number, sets: DprSet[]): DprSession {
  return { date: day(n), sets };
}
/** 3 working sets at one weight. */
function s3(n: number, weight: number, reps: number, rpe: number | null = 7): DprSession {
  return session(n, [
    working(weight, reps, rpe),
    working(weight, reps, rpe),
    working(weight, reps, rpe),
  ]);
}

function decide(
  sessions: DprSession[],
  preset: DprPresetName = "moderate",
  opts: {
    increment?: number;
    now?: Date;
    fallbackWeight?: number | null;
    low?: number;
    high?: number;
  } = {},
) {
  return decideNextWeight({
    sessions,
    repRange: { low: opts.low ?? range.low, high: opts.high ?? range.high },
    preset: DPR_PRESETS[preset],
    increment: opts.increment ?? 2.5,
    now: opts.now ?? day(30),
    fallbackWeight: opts.fallbackWeight,
  });
}

describe("decideNextWeight — increases", () => {
  it.each([
    // preset, sessions (newest first), expected call, weight
    ["moderate", [s3(28, 185, 8, 7.5)], "increase", 190],
    ["aggressive", [s3(28, 200, 8, 9)], "increase", 210],
    ["conservative", [s3(28, 185, 8, 7)], "hold", 185],
    ["conservative", [s3(28, 185, 8, 7), s3(25, 185, 8, 7.5)], "increase", 187.5],
    ["conservative", [s3(28, 185, 8, 7), s3(25, 180, 8, 7)], "hold", 185],
    ["moderate", [s3(28, 185, 8, 8.5)], "hold", 185],
    ["aggressive", [s3(28, 185, 8, 9.2)], "hold", 185],
    ["moderate", [s3(28, 185, 7, 7)], "hold", 185],
  ] as const)("%s: %#", (preset, sessions, call, weight) => {
    const d = decide([...sessions], preset);
    expect(d.call).toBe(call);
    expect(d.weight).toBe(weight);
  });

  it("aims for the bottom of the range after an increase", () => {
    const d = decide([s3(28, 185, 8)]);
    expect(d.targetReps).toBe(6);
    expect(d.reason).toBe("Hit 3×8 @ RPE 7");
  });

  it("explains an over-cap RPE hold", () => {
    expect(decide([s3(28, 185, 8, 8.5)]).reason).toContain("RPE over 8 cap");
  });
});

describe("decideNextWeight — misses and deloads", () => {
  it.each([
    ["moderate", 1, "hold"],
    ["moderate", 2, "hold"],
    ["moderate", 3, "deload"],
    ["aggressive", 3, "deload"],
    ["conservative", 1, "hold"],
    ["conservative", 2, "deload"],
  ] as const)("%s after %s miss(es) → %s", (preset, misses, call) => {
    const sessions = Array.from({ length: misses }, (_, i) => s3(28 - i * 3, 200, 5));
    const d = decide(sessions, preset);
    expect(d.call).toBe(call);
    expect(d.streak).toBe(misses);
    // 200 − 10% = 180, already on a 2.5 step
    expect(d.weight).toBe(call === "deload" ? 180 : 200);
  });

  it("counts an RPE of 9.5+ as a miss even with the reps", () => {
    const sessions = [s3(28, 200, 8, 9.5), s3(25, 200, 8, 9.5), s3(22, 200, 8, 10)];
    expect(decide(sessions).call).toBe("deload");
  });

  it("rounds the deload down to the increment", () => {
    const sessions = [s3(28, 185, 4), s3(25, 185, 4), s3(22, 185, 4)];
    // 185 × 0.9 = 166.5 → 165
    expect(decide(sessions).weight).toBe(165);
  });

  it("resets the miss streak once the weight changes", () => {
    const sessions = [s3(28, 180, 5), s3(25, 200, 5), s3(22, 200, 5)];
    const d = decide(sessions);
    expect(d.call).toBe("hold");
    expect(d.streak).toBe(1);
  });

  it("rounds kg deloads to the kg step", () => {
    const sessions = [s3(28, 83, 4), s3(25, 83, 4), s3(22, 83, 4)];
    // 83 × 0.9 = 74.7 → 73.75 on a 1.25 kg step
    expect(decide(sessions, "moderate", { increment: 1.25 }).weight).toBe(73.75);
  });
});

describe("decideNextWeight — layoffs", () => {
  it.each([
    [13, "increase", 190],
    [14, "reenter", 175], // 185 × 0.95 = 175.75 → 175
    [27, "reenter", 175],
    [28, "reenter", 165], // 185 × 0.9 = 166.5 → 165
    [60, "reenter", 165],
  ] as const)("%s days off → %s %s", (gap, call, weight) => {
    const d = decide([s3(0, 185, 8)], "moderate", { now: day(gap) });
    expect(d.call).toBe(call);
    expect(d.weight).toBe(weight);
  });

  it("takes priority over a pending deload", () => {
    const sessions = [s3(6, 200, 5), s3(3, 200, 5), s3(0, 200, 5)];
    expect(decide(sessions, "moderate", { now: day(40) }).call).toBe("reenter");
  });
});

describe("decideNextWeight — RPE and set kinds", () => {
  it("is insufficient with no history, falling back to the target weight", () => {
    const d = decide([], "moderate", { fallbackWeight: 135 });
    expect(d).toMatchObject({ call: "insufficient", weight: 135 });
    expect(decide([]).weight).toBeNull();
  });

  it("is insufficient when no session has RPE, using the last weight", () => {
    const d = decide([s3(28, 185, 8, null)], "moderate", { fallbackWeight: 135 });
    expect(d).toMatchObject({ call: "insufficient", weight: 185, reason: "Add RPE for DPR" });
  });

  it("skips a session missing RPE and decides from the last eligible one", () => {
    const d = decide([s3(28, 185, 8, null), s3(25, 185, 8, 7)]);
    expect(d.call).toBe("increase");
    expect(d.reason).toContain("Add RPE for DPR");
  });

  it("treats one missing RPE as making the whole session ineligible", () => {
    const partial = session(28, [working(185, 8, 7), working(185, 8, null)]);
    expect(decide([partial]).call).toBe("insufficient");
  });

  it("ignores warm-up, drop and failure sets", () => {
    const mixed = session(28, [
      { kind: "warmup", weight: 95, reps: 3, rpe: null },
      working(185, 8, 7),
      working(185, 8, 7.5),
      { kind: "drop", weight: 135, reps: 4, rpe: 10 },
      { kind: "failure", weight: 185, reps: 2, rpe: 10 },
    ]);
    expect(decide([mixed])).toMatchObject({ call: "increase", weight: 190 });
  });

  it("learns from an overridden weight", () => {
    // DPR suggested 190 but the user did 195 and hit it.
    const d = decide([s3(28, 195, 8), s3(25, 185, 8)]);
    expect(d.weight).toBe(200);
  });
});

describe("resolveRepRange", () => {
  const history = [
    { exerciseId: "bench", targetRepsLow: 8, targetRepsHigh: 12, updatedAt: day(1) },
    { exerciseId: "bench", targetRepsLow: 4, targetRepsHigh: 6, updatedAt: day(5) },
    { exerciseId: "squat", targetRepsLow: 3, targetRepsHigh: 5, updatedAt: day(9) },
  ];

  it("prefers the running routine's range", () => {
    expect(resolveRepRange("bench", { targetRepsLow: 10, targetRepsHigh: 15 }, history)).toEqual({
      low: 10,
      high: 15,
    });
  });

  it("falls back to the most recent routine with the lift", () => {
    expect(
      resolveRepRange("bench", { targetRepsLow: null, targetRepsHigh: null }, history),
    ).toEqual({ low: 4, high: 6 });
  });

  it("falls back to the 6–10 default", () => {
    expect(resolveRepRange("row", null, history)).toEqual({ low: 6, high: 10 });
  });

  it("treats a single bound as a fixed rep target", () => {
    expect(resolveRepRange("bench", { targetRepsLow: 5, targetRepsHigh: null })).toEqual({
      low: 5,
      high: 5,
    });
  });
});

describe("per-range isolation", () => {
  it("keeps heavy and volume bench apart", () => {
    const heavy = { low: 4, high: 6 };
    const volume = { low: 8, high: 12 };
    const history = [
      { exerciseId: "bench", repRange: heavy, ...s3(28, 225, 6, 7) },
      { exerciseId: "bench", repRange: volume, ...s3(26, 165, 9, 8) },
      { exerciseId: "squat", repRange: heavy, ...s3(27, 315, 6, 7) },
    ];
    const heavySessions = sessionsForKey(history, "bench", heavy);
    expect(heavySessions).toHaveLength(1);
    expect(
      decideNextWeight({
        sessions: heavySessions,
        repRange: heavy,
        preset: DPR_PRESETS.moderate,
        increment: 2.5,
        now: day(30),
      }),
    ).toMatchObject({ call: "increase", weight: 230 });
    expect(
      decideNextWeight({
        sessions: sessionsForKey(history, "bench", volume),
        repRange: volume,
        preset: DPR_PRESETS.moderate,
        increment: 2.5,
        now: day(30),
      }),
    ).toMatchObject({ call: "hold", weight: 165 });
    expect(dprStateKey("bench", heavy)).not.toBe(dprStateKey("bench", volume));
  });
});

describe("decisionLog", () => {
  it("replays the call made after each session, newest first", () => {
    const sessions = [s3(0, 185, 8), s3(3, 190, 6), s3(30, 190, 8)];
    const log = decisionLog(sessions, {
      repRange: range,
      preset: DPR_PRESETS.moderate,
      increment: 2.5,
      now: day(32),
    });
    expect(log.map((e) => e.decision.call)).toEqual(["increase", "reenter", "increase"]);
    expect(log.map((e) => e.sessionDate)).toEqual([day(30), day(3), day(0)]);
  });
});

describe("decideNextWeight — rest compliance (issue #233)", () => {
  /**
   * 3 working sets, the 2nd and 3rd at `reps` after `rest` of a 120s target
   * (the 1st, with no rest before it, hits the top of the range).
   */
  function rested(n: number, weight: number, reps: number, rpe: number, rest: number) {
    return session(n, [
      working(weight, 8, rpe),
      { ...working(weight, reps, rpe), restSeconds: rest, restTargetSeconds: 120 },
      { ...working(weight, reps, rpe), restSeconds: rest, restTargetSeconds: 120 },
    ]);
  }

  it("lets a session on short rests qualify a little over the RPE cap", () => {
    // Moderate caps at RPE 8; 8.5 on short rest still earns the increase.
    const d = decide([rested(28, 185, 8, 8.5, 60)]);
    expect(d.call).toBe("increase");
    expect(d.reason).toBe("Hit 3×8 @ RPE 8.5 on short rest");
    expect(d.weight).toBe(190);
  });

  it("gives no credit when the full rest was taken", () => {
    expect(decide([rested(28, 185, 8, 8.5, 120)]).call).toBe("hold");
  });

  it("doesn't count a rep miss after a short rest toward a deload", () => {
    const sessions = [
      rested(28, 200, 5, 8, 45),
      rested(25, 200, 5, 8, 45),
      rested(22, 200, 5, 8, 45),
    ];
    const d = decide(sessions);
    expect(d.call).toBe("hold");
    expect(d.streak).toBe(0);
  });

  it("still counts a rep miss after a full rest", () => {
    const sessions = [
      rested(28, 200, 5, 8, 150),
      rested(25, 200, 5, 8, 150),
      rested(22, 200, 5, 8, 150),
    ];
    expect(decide(sessions).call).toBe("deload");
  });
});

describe("decideNextWeight — light days (issue #235)", () => {
  function light(s: DprSession): DprSession {
    return { ...s, intensity: "light" };
  }

  it("ignores a light session when deciding", () => {
    // Qualified at 185, then went light at 165: still an increase from 185.
    const d = decide([light(s3(29, 165, 8, 6)), s3(28, 185, 8, 7.5)]);
    expect(d.call).toBe("increase");
    expect(d.previousWeight).toBe(185);
    expect(d.weight).toBe(190);
  });

  it("doesn't break a conservative qualifying streak", () => {
    const d = decide(
      [s3(29, 185, 8, 7), light(s3(28, 165, 6, 9)), s3(25, 185, 8, 7)],
      "conservative",
    );
    expect(d.call).toBe("increase");
    expect(d.streak).toBe(2);
  });

  it("doesn't add to a miss streak", () => {
    const sessions = [light(s3(29, 180, 4)), s3(28, 200, 5), s3(25, 200, 5)];
    const d = decide(sessions);
    expect(d.call).toBe("hold");
    expect(d.streak).toBe(2);
  });

  it("still counts as training for layoff purposes", () => {
    // 20 days since the last full session, but a light one 2 days ago.
    const d = decide([light(s3(28, 165, 8)), s3(10, 185, 8)], "moderate", { now: day(30) });
    expect(d.call).toBe("increase");
  });

  it("falls back to light sessions when that's all there is", () => {
    const d = decide([light(s3(28, 165, 8, 7))]);
    expect(d.call).toBe("increase");
    expect(d.previousWeight).toBe(165);
  });
});
