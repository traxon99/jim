import { describe, expect, it } from "vitest";
import type { DprDecision } from "../../dpr/decide";
import {
  INJURY_AREAS,
  JOINT_MUSCLES,
  applyInjuryEffect,
  areaMuscles,
  dayKey,
  formatDayKey,
  injuryAreaLabel,
  injuryHit,
  injuryPrpEffect,
  isDayKey,
  isInjuryOpenOn,
  isPairedArea,
  latestPainByDay,
  markInjuredHistory,
  painCalendar,
  painLabel,
  painSuggestion,
  shouldAskHealed,
  sparingSwapFilter,
  todaysPain,
  worstInjuryHit,
} from "../index";

const KNEE = {
  id: "knee",
  area: "knee",
  side: "left" as const,
  startedOn: "2026-10-10",
  healedOn: null,
  deletedAt: null,
};

const squat = { primaryMuscles: ["quadriceps"], secondaryMuscles: ["glutes"] };
const rdl = { primaryMuscles: ["hamstrings"], secondaryMuscles: ["lower back"] };
const hipThrust = { primaryMuscles: ["glutes"], secondaryMuscles: ["hamstrings"] };
const bench = { primaryMuscles: ["chest"], secondaryMuscles: ["triceps"] };

function day(key: string): Date {
  return new Date(`${key}T12:00:00`);
}

const localKey = (date: Date) => {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
};

describe("injury areas", () => {
  it("offers every muscle and the five joints", () => {
    expect(INJURY_AREAS).toHaveLength(17 + 5);
    expect(INJURY_AREAS).toContain("knee");
    expect(INJURY_AREAS).toContain("lower back");
  });

  it("maps a joint to the muscles around it and a muscle to itself", () => {
    expect(JOINT_MUSCLES.knee).toEqual(["quadriceps", "hamstrings", "calves"]);
    expect(areaMuscles("elbow")).toEqual(["biceps", "triceps", "forearms"]);
    expect(areaMuscles("wrist")).toEqual(["forearms"]);
    expect(areaMuscles("hip")).toEqual(["glutes", "adductors", "abductors"]);
    expect(areaMuscles("ankle")).toEqual(["calves"]);
    expect(areaMuscles("chest")).toEqual(["chest"]);
  });

  it("asks for a side only for paired areas", () => {
    expect(isPairedArea("knee")).toBe(true);
    expect(isPairedArea("shoulders")).toBe(true);
    expect(isPairedArea("lower back")).toBe(false);
    expect(isPairedArea("abdominals")).toBe(false);
  });

  it("labels an area with its side", () => {
    expect(injuryAreaLabel("knee", "left")).toBe("Left knee");
    expect(injuryAreaLabel("shoulders", "both")).toBe("Both shoulders");
    expect(injuryAreaLabel("lower back", null)).toBe("Lower back");
    expect(injuryAreaLabel("hamstrings", "right")).toBe("Right hamstrings");
  });
});

describe("open window", () => {
  it("is open from the start day until the day it's healed", () => {
    const healed = { ...KNEE, healedOn: "2026-10-20" };
    expect(isInjuryOpenOn(healed, "2026-10-09")).toBe(false);
    expect(isInjuryOpenOn(healed, "2026-10-10")).toBe(true);
    expect(isInjuryOpenOn(healed, "2026-10-19")).toBe(true);
    expect(isInjuryOpenOn(healed, "2026-10-20")).toBe(false);
    expect(isInjuryOpenOn(KNEE, "2030-01-01")).toBe(true);
    expect(isInjuryOpenOn({ ...KNEE, deletedAt: new Date() }, "2026-10-12")).toBe(false);
  });
});

describe("affected exercises", () => {
  it("tells a primary hit from a secondary one", () => {
    expect(injuryHit(squat, "knee")).toBe("primary");
    expect(injuryHit(hipThrust, "knee")).toBe("secondary");
    expect(injuryHit(bench, "knee")).toBeNull();
    expect(injuryHit(bench, "elbow")).toBe("secondary");
  });

  it("finds the worst hit across open injuries", () => {
    const elbow = { ...KNEE, id: "elbow", area: "elbow" };
    const healedChest = { ...KNEE, id: "chest", area: "chest", healedOn: "2026-10-12" };
    expect(worstInjuryHit(bench, [elbow, healedChest], "2026-10-15")).toMatchObject({
      hit: "secondary",
      injury: { id: "elbow" },
    });
    expect(
      worstInjuryHit(bench, [elbow, { ...healedChest, healedOn: null }], "2026-10-15"),
    ).toMatchObject({
      hit: "primary",
      injury: { id: "chest" },
    });
    expect(worstInjuryHit(bench, [], "2026-10-15")).toBeNull();
  });
});

describe("pain levels", () => {
  it("labels every level 0–10", () => {
    expect(painLabel(0)).toBe("No pain");
    expect(painLabel(5)).toBe("Moderate");
    expect(painLabel(10)).toBe("Worst possible");
  });

  it("suggests go light at 1–3, swap at 4–6 and skip at 7+", () => {
    expect(painSuggestion(null)).toBeNull();
    expect(painSuggestion(0)).toBeNull();
    expect(painSuggestion(1)).toBe("light");
    expect(painSuggestion(3)).toBe("light");
    expect(painSuggestion(4)).toBe("swap");
    expect(painSuggestion(6)).toBe("swap");
    expect(painSuggestion(7)).toBe("skip");
    expect(painSuggestion(10)).toBe("skip");
  });

  it("keeps the newest check-in per day and never carries a value forward", () => {
    const checkins = [
      {
        injuryId: "knee",
        day: "2026-10-11",
        painLevel: 4,
        updatedAt: new Date(1),
        deletedAt: null,
      },
      {
        injuryId: "knee",
        day: "2026-10-11",
        painLevel: 2,
        updatedAt: new Date(2),
        deletedAt: null,
      },
      {
        injuryId: "knee",
        day: "2026-10-12",
        painLevel: 9,
        updatedAt: new Date(3),
        deletedAt: new Date(4),
      },
      {
        injuryId: "other",
        day: "2026-10-12",
        painLevel: 1,
        updatedAt: new Date(3),
        deletedAt: null,
      },
    ];
    const byDay = latestPainByDay(checkins, "knee");
    expect([...byDay.entries()]).toEqual([["2026-10-11", 2]]);
    expect(todaysPain(checkins, "knee", "2026-10-11")).toBe(2);
    expect(todaysPain(checkins, "knee", "2026-10-12")).toBeNull();
  });

  it("asks Healed? after three check-ins in a row at 0", () => {
    const at = (d: string, painLevel: number) => ({
      injuryId: "knee",
      day: d,
      painLevel,
      updatedAt: new Date(0),
      deletedAt: null,
    });
    expect(shouldAskHealed([at("2026-10-11", 0), at("2026-10-12", 0)], "knee")).toBe(false);
    expect(
      shouldAskHealed([at("2026-10-11", 0), at("2026-10-13", 0), at("2026-10-15", 0)], "knee"),
    ).toBe(true);
    expect(
      shouldAskHealed(
        [at("2026-10-11", 0), at("2026-10-12", 0), at("2026-10-13", 0), at("2026-10-14", 1)],
        "knee",
      ),
    ).toBe(false);
  });
});

describe("PRP", () => {
  const exercises = new Map([
    ["squat", squat],
    ["hipThrust", hipThrust],
  ]);
  const history = [
    { exerciseId: "squat", date: day("2026-10-08"), intensity: null },
    { exerciseId: "squat", date: day("2026-10-12"), intensity: null },
    { exerciseId: "hipThrust", date: day("2026-10-12"), intensity: null },
    { exerciseId: "squat", date: day("2026-10-21"), intensity: "push" as const },
  ];

  it("leaves sessions logged under a primary hit out of progression history", () => {
    const injuries = [{ ...KNEE, healedOn: "2026-10-20" }];
    const marked = markInjuredHistory(history, injuries, (id) => exercises.get(id), localKey);
    expect(marked.map((entry) => entry.intensity)).toEqual([null, "light", null, "push"]);
    expect(markInjuredHistory(history, [], (id) => exercises.get(id), localKey)).toBe(history);
  });

  it("treats a primary hit as a light day while the injury is open", () => {
    expect(
      injuryPrpEffect({
        exerciseId: "squat",
        exercise: squat,
        injuries: [KNEE],
        history,
        today: "2026-10-22",
        dayKeyOf: localKey,
      }),
    ).toBe("light");
    expect(
      injuryPrpEffect({
        exerciseId: "hipThrust",
        exercise: hipThrust,
        injuries: [KNEE],
        history,
        today: "2026-10-22",
        dayKeyOf: localKey,
      }),
    ).toBeNull();
  });

  it("eases a lift back in on its first session after the injury healed", () => {
    const healed = [{ ...KNEE, healedOn: "2026-10-15" }];
    const input = {
      exerciseId: "squat",
      exercise: squat,
      injuries: healed,
      today: "2026-10-16",
      dayKeyOf: localKey,
    };
    expect(injuryPrpEffect({ ...input, history: history.slice(0, 3) })).toBe("ease");
    // Done once since healing: back to normal.
    expect(injuryPrpEffect({ ...input, history, today: "2026-10-22" })).toBeNull();
  });

  const decision: DprDecision = {
    call: "increase",
    weight: 205,
    previousWeight: 200,
    targetReps: 6,
    reason: "Hit 3×10 @ RPE 7",
    streak: 2,
  };

  it("turns the call into a light day or an ease-in", () => {
    expect(applyInjuryEffect(decision, null, 5)).toBe(decision);
    expect(applyInjuryEffect(decision, "light", 5)).toMatchObject({
      call: "light",
      weight: 180,
      reason: "Injury — light day, 180 instead of 200",
    });
    expect(applyInjuryEffect(decision, "ease", 5)).toMatchObject({
      call: "reenter",
      weight: 190,
      previousWeight: 200,
      targetReps: 6,
      reason: "Back from injury — easing back in 5%",
    });
    const light = applyInjuryEffect(decision, "light", 5);
    expect(applyInjuryEffect(light, "light", 5)).toBe(light);
    expect(applyInjuryEffect(light, "ease", 5)).toBe(light);
    const layoff = { ...decision, call: "reenter" as const, weight: 180 };
    expect(applyInjuryEffect(layoff, "ease", 5)).toBe(layoff);
    const fresh = { ...decision, call: "insufficient" as const, previousWeight: null };
    expect(applyInjuryEffect(fresh, "ease", 5)).toBe(fresh);
  });
});

describe("day keys", () => {
  it("formats a day in the runtime's zone or a given one", () => {
    const instant = new Date("2026-10-12T03:30:00Z");
    expect(dayKey(instant, "America/Los_Angeles")).toBe("2026-10-11");
    expect(dayKey(instant, "Europe/Berlin")).toBe("2026-10-12");
    expect(dayKey(new Date(2026, 0, 5, 9))).toBe("2026-01-05");
  });

  it("accepts only real YYYY-MM-DD days", () => {
    expect(isDayKey("2026-10-12")).toBe(true);
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(isDayKey("2026-10-12T00:00")).toBe(false);
  });

  it("formats a day for display", () => {
    expect(formatDayKey("2026-10-12", "2026-10-26")).toBe("Oct 12");
    expect(formatDayKey("2025-12-30", "2026-10-26")).toBe("Dec 30, 2025");
  });
});

describe("swap filter", () => {
  it("keeps exercises that work the original's other muscles and spare the area", () => {
    const keep = sparingSwapFilter(squat, ["knee"]);
    expect(keep({ primaryMuscles: ["glutes"], secondaryMuscles: [] })).toBe(true);
    expect(keep(hipThrust)).toBe(false); // hamstrings, around the knee
    expect(keep(rdl)).toBe(false);
    expect(keep(bench)).toBe(false); // works none of squat's muscles
    const forBench = sparingSwapFilter(bench, ["elbow"]);
    expect(forBench({ primaryMuscles: ["chest"], secondaryMuscles: ["shoulders"] })).toBe(true);
    expect(forBench(bench)).toBe(false);
    expect(forBench({ primaryMuscles: ["chest"], secondaryMuscles: [], category: "warmup" })).toBe(
      false,
    );
  });
});

describe("pain calendar", () => {
  it("keeps each day's worst pain across injuries", () => {
    const row = (injuryId: string, d: string, painLevel: number) => ({
      injuryId,
      day: d,
      painLevel,
      updatedAt: new Date(0),
      deletedAt: null,
    });
    const days = painCalendar(
      ["knee", "elbow"],
      [
        row("knee", "2026-10-11", 3),
        row("elbow", "2026-10-11", 6),
        row("knee", "2026-10-12", 1),
        row("gone", "2026-10-12", 9),
      ],
    );
    expect(days.get("2026-10-11")).toEqual({
      pain: 6,
      entries: [
        { injuryId: "knee", painLevel: 3 },
        { injuryId: "elbow", painLevel: 6 },
      ],
    });
    expect(days.get("2026-10-12")?.pain).toBe(1);
    expect(days.has("2026-10-13")).toBe(false);
  });
});
