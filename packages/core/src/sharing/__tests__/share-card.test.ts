import { describe, expect, it } from "vitest";
import {
  SHARE_CARD_MAX_EXERCISES,
  type ShareCardExercise,
  type ShareCardSet,
  type WorkoutCardInput,
  achievementCardModel,
  prCardModel,
  shareCardModel,
} from "../share-card";

function set(overrides: Partial<ShareCardSet> = {}): ShareCardSet {
  return {
    kind: "working",
    weight: 100,
    reps: 5,
    durationSeconds: null,
    distance: null,
    prKinds: [],
    ...overrides,
  };
}

function exercise(name: string, sets: ShareCardSet[], extra: Partial<ShareCardExercise> = {}) {
  return { name, isWarmup: false, isCardio: false, sets, ...extra };
}

function workout(
  exercises: ShareCardExercise[],
  overrides: Partial<WorkoutCardInput> = {},
): WorkoutCardInput {
  return {
    name: "Push Day",
    startedAt: new Date(2026, 8, 28, 17, 30),
    endedAt: new Date(2026, 8, 28, 18, 22),
    units: "lb",
    routineColor: "blue",
    exercises,
    username: "jim",
    bodyweight: 180,
    ...overrides,
  };
}

const model = (input: WorkoutCardInput, options = {}) =>
  shareCardModel({ kind: "workout", input }, options);

describe("workout card", () => {
  it("shows the name, date, duration, volume and sets", () => {
    const card = model(workout([exercise("Bench Press", [set(), set({ weight: 105 })])]));
    expect(card.title).toBe("Push Day");
    expect(card.subtitles).toEqual(["Sep 28, 2026"]);
    expect(card.tiles).toEqual([
      { label: "Duration", value: "52 min" },
      { label: "Volume", value: "1,025 lb" },
      { label: "Sets", value: "2" },
    ]);
    expect(card.username).toBe("@jim");
  });

  it("leaves warm-up sets and warm-up exercises off", () => {
    const card = model(
      workout([
        exercise("Bench Press", [set({ kind: "warmup", weight: 45 }), set()]),
        exercise("Arm Circles", [set({ weight: null, reps: 20 })], { isWarmup: true }),
      ]),
    );
    expect(card.exercises.map((row) => row.name)).toEqual(["Bench Press"]);
    expect(card.exercises[0]?.topSet).toBe("100 lb × 5");
    expect(card.tiles.find((tile) => tile.label === "Sets")?.value).toBe("1");
    expect(card.tiles.find((tile) => tile.label === "Volume")?.value).toBe("500 lb");
  });

  it("counts drop and failure sets as working", () => {
    const card = model(
      workout([
        exercise("Curl", [
          set({ kind: "working", weight: 30, reps: 10 }),
          set({ kind: "drop", weight: 20, reps: 12 }),
          set({ kind: "failure", weight: 20, reps: 8 }),
        ]),
      ]),
    );
    expect(card.tiles.find((tile) => tile.label === "Sets")?.value).toBe("3");
  });

  it("picks the top set by estimated 1RM, not by weight", () => {
    // 100 × 12 (e1RM 140) beats 120 × 3 (e1RM 132).
    const card = model(
      workout([exercise("Row", [set({ weight: 120, reps: 3 }), set({ weight: 100, reps: 12 })])]),
    );
    expect(card.exercises[0]?.topSet).toBe("100 lb × 12");
  });

  it("flags only exercises with a record from that session", () => {
    const card = model(
      workout([exercise("Squat", [set({ prKinds: ["1rm"] }), set()]), exercise("Row", [set()])]),
    );
    expect(card.exercises.map((row) => row.pr)).toEqual([true, false]);
    expect(card.tiles.at(-1)).toEqual({ label: "PRs", value: "1" });
  });

  it("caps the list at six, keeping record exercises first, with +N more", () => {
    const names = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const exercises = names.map((name) =>
      exercise(name, [set({ prKinds: name === "H" ? ["weight"] : [] })]),
    );
    const card = model(workout(exercises));
    expect(card.exercises).toHaveLength(SHARE_CARD_MAX_EXERCISES);
    expect(card.moreExercises).toBe(2);
    // H has the record, so it makes the cut; the list stays in session order.
    expect(card.exercises.map((row) => row.name)).toEqual(["A", "B", "C", "D", "E", "H"]);
  });

  it("switches a cardio-only session to distance, time and pace", () => {
    const run = exercise(
      "Run",
      [set({ weight: null, reps: null, distance: 3, durationSeconds: 1500 })],
      {
        isCardio: true,
      },
    );
    const card = model(workout([run]));
    expect(card.tiles).toEqual([
      { label: "Distance", value: "3 mi" },
      { label: "Time", value: "25:00" },
      { label: "Pace", value: "8:20 /mi" },
    ]);
    expect(card.exercises[0]?.topSet).toBe("3 mi · 25:00");
  });

  it("formats lb and kg with the unit label", () => {
    const kg = model(
      workout([exercise("Bench", [set({ weight: 62.5, reps: 8 })])], { units: "kg" }),
    );
    expect(kg.exercises[0]?.topSet).toBe("62.5 kg × 8");
    expect(kg.tiles.find((tile) => tile.label === "Volume")?.value).toBe("500 kg");
  });

  it("falls back to the default color for an ad hoc workout", () => {
    expect(model(workout([exercise("Bench", [set()])], { routineColor: null })).colorKey).toBe(
      "default",
    );
    expect(model(workout([exercise("Bench", [set()])])).colorKey).toBe("blue");
  });

  it("leaves bodyweight off unless the user opts in", () => {
    const input = workout([exercise("Bench", [set()])]);
    const off = model(input);
    expect(off.includesPrivate).toBe(false);
    expect(JSON.stringify(off)).not.toContain("180");
    const on = model(input, { includeBodyweight: true });
    expect(on.includesPrivate).toBe(true);
    expect(on.tiles.at(-1)).toEqual({ label: "Bodyweight", value: "180 lb" });
  });

  it("never carries injury or sick-day data under any options", () => {
    const input = {
      ...workout([exercise("Bench", [set()])]),
      injuries: [{ name: "Torn rotator cuff" }],
      sickDays: [new Date(2026, 8, 27)],
    };
    for (const options of [{}, { includeBodyweight: true }]) {
      const text = JSON.stringify(model(input, options)).toLowerCase();
      expect(text).not.toContain("rotator");
      expect(text).not.toContain("injur");
      expect(text).not.toContain("sick");
    }
  });

  it("names an unnamed workout and omits the footer name when unknown", () => {
    const card = model(workout([exercise("Bench", [set()])], { name: "  ", username: null }));
    expect(card.title).toBe("Workout");
    expect(card.username).toBeNull();
  });
});

describe("PR card", () => {
  const base = {
    exerciseName: "Bench Press",
    kind: "1rm" as const,
    value: 225,
    weight: 200,
    reps: 4,
    oneRepMax: 226.6,
    achievedAt: new Date(2026, 8, 28),
    standard: { tier: "intermediate" as const },
    units: "lb" as const,
    routineColor: "red" as const,
    username: "@jim",
    bodyweight: 180,
  };

  it("shows the lift, weight × reps, e1RM and the standard badge", () => {
    const card = prCardModel(base);
    expect(card.title).toBe("Bench Press");
    expect(card.hero).toBe("200 lb × 4");
    expect(card.tiles).toEqual([{ label: "Estimated 1RM", value: "227 lb" }]);
    expect(card.badge).toBe("Intermediate");
    expect(card.subtitles).toEqual(["Estimated 1RM", "Sep 28, 2026"]);
    expect(card.username).toBe("@jim");
  });

  it("labels a lift below Beginner, and omits the badge without a standard", () => {
    expect(prCardModel({ ...base, standard: { tier: null } }).badge).toBe("Below Beginner");
    expect(prCardModel({ ...base, standard: null }).badge).toBeNull();
  });

  it("falls back to the record's value when the set can't be found", () => {
    expect(prCardModel({ ...base, weight: null, reps: null }).hero).toBe("225 lb");
    expect(
      prCardModel({ ...base, kind: "reps_at_weight", value: 12, weight: null, reps: null }).hero,
    ).toBe("12 reps");
  });

  it("adds bodyweight only when asked", () => {
    expect(prCardModel(base).includesPrivate).toBe(false);
    const on = prCardModel(base, { includeBodyweight: true });
    expect(on.includesPrivate).toBe(true);
    expect(on.tiles.at(-1)).toEqual({ label: "Bodyweight", value: "180 lb" });
  });
});

describe("achievement card", () => {
  it("shows the name, description, icon and date", () => {
    const card = achievementCardModel({
      title: "Two plates",
      description: "Lift 225 lb on a barbell",
      category: "plates",
      achievedAt: new Date(2026, 8, 28),
      routineColor: null,
      username: "jim",
    });
    expect(card.kind).toBe("achievement");
    expect(card.title).toBe("Two plates");
    expect(card.subtitles).toEqual(["Lift 225 lb on a barbell", "Sep 28, 2026"]);
    expect(card.icon).toBe("plates");
    expect(card.colorKey).toBe("default");
    expect(card.includesPrivate).toBe(false);
  });
});
