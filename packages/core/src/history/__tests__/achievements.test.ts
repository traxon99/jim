import { describe, expect, it } from "vitest";
import { tierForOneRepMax } from "../../strength-standards";
import {
  type AchievementInput,
  type AchievementSet,
  achievementsEarnedInSession,
  deriveAchievements,
  plateLoad,
  platesPerSide,
  trainingStreak,
  weeklyStreakTarget,
} from "../achievements";

// Local-time dates, since week boundaries are local (startOfWeek).
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);

describe("weeklyStreakTarget", () => {
  it("is one workout a week with no active program", () => {
    expect(weeklyStreakTarget(null)).toBe(1);
  });

  it("counts distinct scheduled weekdays in a weekly program", () => {
    expect(
      weeklyStreakTarget({
        mode: "weekly",
        items: [
          { weekday: 1, deletedAt: null },
          { weekday: 3, deletedAt: null },
          { weekday: 3, deletedAt: null },
          { weekday: 5, deletedAt: new Date() },
        ],
      }),
    ).toBe(2);
  });

  it("uses a sequence's length, capped at a week", () => {
    const item = { weekday: null, deletedAt: null };
    expect(weeklyStreakTarget({ mode: "sequence", items: [item, item, item] })).toBe(3);
    expect(weeklyStreakTarget({ mode: "sequence", items: Array(9).fill(item) })).toBe(7);
    expect(weeklyStreakTarget({ mode: "sequence", items: [] })).toBe(1);
  });

  it("doesn't count rest days as planned workouts", () => {
    const workout = { routineId: "a", weekday: 1, deletedAt: null };
    const rest = { routineId: null, weekday: 3, deletedAt: null };
    expect(weeklyStreakTarget({ mode: "weekly", items: [workout, rest] })).toBe(1);
    expect(weeklyStreakTarget({ mode: "sequence", items: [workout, rest, workout] })).toBe(2);
  });
});

describe("trainingStreak", () => {
  // Weeks start Monday (weekStart = 1). 2026-09-28 is a Monday.
  const now = day(2026, 9, 30);

  it("counts consecutive weeks meeting the target", () => {
    const streak = trainingStreak(
      [
        day(2026, 9, 14),
        day(2026, 9, 16),
        day(2026, 9, 21),
        day(2026, 9, 23),
        day(2026, 9, 28),
        day(2026, 9, 29),
      ],
      2,
      1,
      now,
    );
    expect(streak).toEqual({ weeklyTarget: 2, current: 3, longest: 3, thisWeek: 2 });
  });

  it("doesn't break on a current week that's still short of the target", () => {
    const streak = trainingStreak(
      [day(2026, 9, 15), day(2026, 9, 22), day(2026, 9, 28)],
      2,
      1,
      now,
    );
    expect(streak.current).toBe(0);
    const lenient = trainingStreak([day(2026, 9, 15), day(2026, 9, 22)], 1, 1, now);
    expect(lenient.current).toBe(2);
    expect(lenient.thisWeek).toBe(0);
  });

  it("resets after a missed week but remembers the longest run", () => {
    const streak = trainingStreak(
      [day(2026, 8, 31), day(2026, 9, 7), day(2026, 9, 10), day(2026, 9, 22)],
      1,
      1,
      now,
    );
    expect(streak.current).toBe(1);
    expect(streak.longest).toBe(2);
  });

  it("is all zeros with no history", () => {
    expect(trainingStreak([], 3, 0, now)).toEqual({
      weeklyTarget: 3,
      current: 0,
      longest: 0,
      thisWeek: 0,
    });
  });
});

describe("plate helpers", () => {
  it("maps plates a side to bar load and back", () => {
    expect(plateLoad(1, "lb")).toBe(135);
    expect(plateLoad(4, "lb")).toBe(405);
    expect(plateLoad(2, "kg")).toBe(100);
    expect(platesPerSide(135, "lb")).toBe(1);
    expect(platesPerSide(314, "lb")).toBe(2);
    expect(platesPerSide(315, "lb")).toBe(3);
    expect(platesPerSide(95, "lb")).toBe(0);
  });
});

function set(overrides: Partial<AchievementSet> = {}): AchievementSet {
  return {
    sessionId: "s1",
    completedAt: day(2026, 9, 1),
    weight: 100,
    reps: 5,
    barbell: true,
    ...overrides,
  };
}

function input(overrides: Partial<AchievementInput> = {}): AchievementInput {
  return {
    workouts: [{ sessionId: "s1", endedAt: day(2026, 9, 1) }],
    sets: [],
    units: "lb",
    bodyweight: null,
    strengthProfile: null,
    strengthRecords: [],
    ...overrides,
  };
}

const byId = (list: ReturnType<typeof deriveAchievements>, id: string) =>
  list.find((achievement) => achievement.id === id);

describe("deriveAchievements", () => {
  it("shows nothing for someone with no finished workouts", () => {
    expect(deriveAchievements(input({ workouts: [] }))).toEqual([]);
  });

  it("dates workout-count milestones to the Nth workout and tracks progress", () => {
    const workouts = Array.from({ length: 12 }, (_, i) => ({
      sessionId: `s${i + 1}`,
      endedAt: day(2026, 8, i + 1),
    }));
    const list = deriveAchievements(input({ workouts: [...workouts].reverse() }));
    expect(byId(list, "workouts-1")?.sessionId).toBe("s1");
    expect(byId(list, "workouts-10")).toMatchObject({
      sessionId: "s10",
      achievedAt: day(2026, 8, 10),
    });
    expect(byId(list, "workouts-25")).toMatchObject({
      achievedAt: null,
      progress: { current: 12, target: 25 },
    });
  });

  it("dates a volume milestone to the set that crossed it", () => {
    const list = deriveAchievements(
      input({
        sets: [
          set({ sessionId: "a", completedAt: day(2026, 9, 1), weight: 200, reps: 25 }),
          set({ sessionId: "b", completedAt: day(2026, 9, 2), weight: 100, reps: 50 }),
        ],
      }),
    );
    expect(byId(list, "volume-10000")).toMatchObject({
      sessionId: "b",
      achievedAt: day(2026, 9, 2),
    });
    expect(byId(list, "volume-100000")?.progress).toEqual({ current: 10000, target: 100000 });
  });

  it("only counts barbell sets with reps toward plate and bodyweight milestones", () => {
    const list = deriveAchievements(
      input({
        bodyweight: 180,
        sets: [
          set({ sessionId: "press", weight: 400, barbell: false }),
          set({ sessionId: "miss", weight: 225, reps: 0, completedAt: day(2026, 9, 2) }),
          set({ sessionId: "squat", weight: 225, completedAt: day(2026, 9, 3) }),
        ],
      }),
    );
    expect(byId(list, "plates-1")?.sessionId).toBe("squat");
    expect(byId(list, "plates-2")?.sessionId).toBe("squat");
    expect(byId(list, "plates-3")?.achievedAt).toBeNull();
    expect(byId(list, "bodyweight-1")?.sessionId).toBe("squat");
    expect(byId(list, "bodyweight-1.5")?.achievedAt).toBeNull();
  });

  it("skips bodyweight and strength milestones without a profile", () => {
    const list = deriveAchievements(input());
    expect(list.some((a) => a.category === "bodyweight" || a.category === "strength")).toBe(false);
  });

  it("dates strength tiers to the first 1RM record reaching them", () => {
    const list = deriveAchievements(
      input({
        strengthProfile: { sex: "male", bodyweight: 180 },
        strengthRecords: [
          { lift: "squat", oneRepMax: 1000, achievedAt: day(2026, 9, 5), sessionId: "late" },
          { lift: "squat", oneRepMax: 200, achievedAt: day(2026, 9, 1), sessionId: "early" },
        ],
      }),
    );
    expect(byId(list, "strength-beginner")?.sessionId).toBe("early");
    expect(byId(list, "strength-elite")?.sessionId).toBe("late");
  });

  it("judges past lifts against the bodyweight on that day (#249)", () => {
    const records = [
      { lift: "squat" as const, oneRepMax: 300, achievedAt: day(2026, 9, 1), sessionId: "old" },
    ];
    const sets = [set({ sessionId: "old", completedAt: day(2026, 9, 1), weight: 300, reps: 1 })];
    const today = deriveAchievements(
      input({
        bodyweight: 300,
        strengthProfile: { sex: "male", bodyweight: 300 },
        strengthRecords: records,
        sets,
      }),
    );
    const then = deriveAchievements(
      input({
        bodyweight: 300,
        strengthProfile: { sex: "male", bodyweight: 300 },
        strengthRecords: records,
        sets,
        bodyweightAt: () => 150,
      }),
    );
    expect(byId(today, "bodyweight-2")?.achievedAt).toBeNull();
    expect(byId(then, "bodyweight-2")?.sessionId).toBe("old");
    const tierAt150 = tierForOneRepMax("squat", 300, { sex: "male", bodyweight: 150 });
    const tierAt300 = tierForOneRepMax("squat", 300, { sex: "male", bodyweight: 300 });
    expect(tierAt150).not.toBe(tierAt300);
    expect(byId(then, `strength-${tierAt150}`)?.sessionId).toBe("old");
    expect(byId(today, `strength-${tierAt150}`)?.achievedAt).toBeNull();
  });

  it("picks out what one workout earned", () => {
    const list = deriveAchievements(
      input({ sets: [set({ sessionId: "s1", weight: 135, reps: 1 })] }),
    );
    expect(achievementsEarnedInSession(list, "s1").map((a) => a.id)).toEqual([
      "workouts-1",
      "plates-1",
    ]);
    expect(achievementsEarnedInSession(list, "other")).toEqual([]);
  });
});
