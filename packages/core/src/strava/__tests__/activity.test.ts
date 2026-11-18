import { describe, expect, it } from "vitest";
import {
  STRAVA_DESCRIPTION_MAX,
  type StravaActivityInput,
  type StravaExerciseInput,
  type StravaSetInput,
  shouldPostToStrava,
  stravaActivityFor,
  stravaSportForCardio,
} from "../index";

const START = new Date("2026-11-18T17:30:00Z");
const END = new Date("2026-11-18T18:45:30Z");

function exercise(
  id: string,
  name: string,
  extra: Partial<StravaExerciseInput> = {},
): StravaExerciseInput {
  return {
    sessionExerciseId: `se-${id}`,
    exerciseId: `ex-${id}`,
    position: 0,
    name,
    category: "strength",
    trackingType: "weight_reps",
    ...extra,
  };
}

let n = 0;
function set(seId: string, extra: Partial<StravaSetInput> = {}): StravaSetInput {
  n++;
  return {
    id: `set-${n}`,
    sessionExerciseId: seId,
    kind: "working",
    weight: null,
    reps: null,
    durationSeconds: null,
    distance: null,
    supersedesId: null,
    ...extra,
  };
}

function build(overrides: Partial<StravaActivityInput>): ReturnType<typeof stravaActivityFor> {
  return stravaActivityFor({
    session: { name: "Push Day", startedAt: START, endedAt: END },
    exercises: [],
    sets: [],
    prs: [],
    units: "lb",
    ...overrides,
  });
}

describe("stravaActivityFor", () => {
  it("posts strength as WeightTraining with the session's name and elapsed time", () => {
    const bench = exercise("bench", "Bench Press");
    const activity = build({
      exercises: [bench],
      sets: [set("se-bench", { weight: "185.00", reps: 5 })],
    });
    expect(activity.sport_type).toBe("WeightTraining");
    expect(activity.name).toBe("Push Day");
    expect(activity.elapsed_time).toBe(75 * 60 + 30);
    expect(activity.distance).toBeUndefined();
  });

  it("writes the start in the lifter's time zone", () => {
    const utc = build({});
    expect(utc.start_date_local).toBe("2026-11-18T17:30:00Z");
    const ny = build({ timeZone: "America/New_York" });
    expect(ny.start_date_local).toBe("2026-11-18T12:30:00Z");
  });

  it("lists working sets per exercise, formatted, without warm-ups", () => {
    const bench = exercise("bench", "Bench Press", { position: 0 });
    const warm = exercise("warm", "Arm circles", { position: 1, category: "warmup" });
    const activity = build({
      exercises: [warm, bench],
      sets: [
        set("se-bench", { kind: "warmup", weight: 95, reps: 10 }),
        set("se-bench", { weight: "185.00", reps: 5 }),
        set("se-bench", { weight: 185, reps: 5 }),
        set("se-bench", { weight: "62.50", reps: 3 }),
        set("se-warm", { reps: 20 }),
      ],
    });
    expect(activity.description).toContain("Bench Press: 185×5, 185×5, 62.5×3");
    expect(activity.description).not.toContain("95");
    expect(activity.description).not.toContain("Arm circles");
  });

  it("marks sets that set a PR and adds a PR line", () => {
    const bench = exercise("bench", "Bench Press");
    const sets = [
      set("se-bench", { weight: 185, reps: 5 }),
      set("se-bench", { weight: 195, reps: 3 }),
    ];
    const activity = build({
      exercises: [bench],
      sets,
      prs: [{ setId: sets[1]?.id ?? null, kind: "1rm", exerciseId: "ex-bench" }],
    });
    expect(activity.description).toContain("Bench Press: 185×5, 195×3 🏆");
    expect(activity.description).toContain("🏆 PR: Bench Press");
  });

  it("ignores PR kinds the app doesn't show", () => {
    const bench = exercise("bench", "Bench Press");
    const sets = [set("se-bench", { weight: 185, reps: 5 })];
    const activity = build({
      exercises: [bench],
      sets,
      prs: [{ setId: sets[0]?.id ?? null, kind: "volume", exerciseId: "ex-bench" }],
    });
    expect(activity.description).not.toContain("🏆");
  });

  it("uses each exercise's current set after an edit, not the superseded one", () => {
    const bench = exercise("bench", "Bench Press");
    const original = set("se-bench", { weight: 135, reps: 5 });
    const edit = set("se-bench", { weight: 145, reps: 5, supersedesId: original.id });
    const deleted = set("se-bench", { weight: 225, reps: 1, deletedAt: new Date() });
    const activity = build({ exercises: [bench], sets: [original, edit, deleted] });
    expect(activity.description).toContain("Bench Press: 145×5");
    expect(activity.description).not.toContain("135");
    expect(activity.description).not.toContain("225");
  });

  it("states the volume in the lifter's units", () => {
    const bench = exercise("bench", "Bench Press");
    const sets = [set("se-bench", { weight: 100, reps: 10 })];
    expect(build({ exercises: [bench], sets, units: "kg" }).description).toContain("1,000 kg");
    expect(build({ exercises: [bench], sets, units: "lb" }).description).toContain("1,000 lb");
  });

  it("posts a single-sport cardio workout as that sport with its distance", () => {
    const run = exercise("run", "Running (Outdoor)", {
      slug: "cardio-running-outdoor",
      category: "cardio",
      trackingType: "distance_time",
    });
    const activity = build({
      session: { name: null, startedAt: START, endedAt: END },
      exercises: [run],
      sets: [set("se-run", { distance: "5.00", durationSeconds: 1500 })],
      units: "kg",
    });
    expect(activity.sport_type).toBe("Run");
    expect(activity.distance).toBe(5000);
    expect(activity.name).toBe("Workout");
    expect(activity.description).toBe("Running (Outdoor): 5 km · 25:00");
  });

  it("converts miles to meters for lb lifters", () => {
    const walk = exercise("walk", "Walking", {
      slug: "cardio-walking-outdoor",
      category: "cardio",
      trackingType: "distance_time",
    });
    const activity = build({
      exercises: [walk],
      sets: [set("se-walk", { distance: 2, durationSeconds: 2400 })],
    });
    expect(activity.sport_type).toBe("Walk");
    expect(activity.distance).toBe(3219);
  });

  it("falls back to WeightTraining for strength plus cardio and Workout for mixed cardio", () => {
    const bench = exercise("bench", "Bench Press");
    const run = exercise("run", "Running", { slug: "cardio-running-outdoor", category: "cardio" });
    const bike = exercise("bike", "Assault Bike", {
      slug: "cardio-assault-bike",
      category: "cardio",
    });
    const mixed = build({
      exercises: [bench, run],
      sets: [set("se-bench", { weight: 100, reps: 5 }), set("se-run", { distance: 1 })],
    });
    expect(mixed.sport_type).toBe("WeightTraining");
    expect(mixed.distance).toBeUndefined();

    const cardioMix = build({
      exercises: [run, bike],
      sets: [set("se-run", { distance: 1 }), set("se-bike", { distance: 2 })],
    });
    expect(cardioMix.sport_type).toBe("Workout");
    expect(cardioMix.distance).toBeUndefined();
  });

  it("ignores a warm-up-only cardio exercise when picking the sport", () => {
    const run = exercise("run", "Running", { slug: "cardio-running-outdoor", category: "cardio" });
    const activity = build({
      exercises: [run],
      sets: [set("se-run", { kind: "warmup", distance: 1 }), set("se-run", { distance: 3 })],
      units: "kg",
    });
    expect(activity.distance).toBe(3000);
  });

  it("keeps the description under Strava's limit", () => {
    const exercises = Array.from({ length: 60 }, (_, i) =>
      exercise(String(i), `Exercise number ${i} with a long name`, { position: i }),
    );
    const sets = exercises.flatMap((e) =>
      Array.from({ length: 6 }, () => set(e.sessionExerciseId, { weight: 225.5, reps: 8 })),
    );
    const activity = build({ exercises, sets });
    expect(activity.description.length).toBeLessThanOrEqual(STRAVA_DESCRIPTION_MAX);
    expect(activity.description.endsWith("…")).toBe(true);
  });

  it("posts nothing about injuries, sick days or bodyweight", () => {
    const bench = exercise("bench", "Bench Press");
    const activity = build({
      exercises: [bench],
      sets: [set("se-bench", { weight: 100, reps: 5 })],
    });
    expect(JSON.stringify(activity).toLowerCase()).not.toMatch(/injur|sick|bodyweight|pain/);
  });
});

describe("stravaSportForCardio", () => {
  it("maps everyday cardio names", () => {
    expect(stravaSportForCardio({ name: "Treadmill Run" })).toBe("Run");
    expect(stravaSportForCardio({ name: "Incline Walk", slug: "cardio-incline-walk" })).toBe(
      "Walk",
    );
    expect(stravaSportForCardio({ name: "Stationary Bike" })).toBe("Ride");
    expect(stravaSportForCardio({ name: "Rowing Machine" })).toBe("Rowing");
    expect(stravaSportForCardio({ name: "Swimming", slug: "cardio-swimming" })).toBe("Swim");
    expect(stravaSportForCardio({ name: "Elliptical Trainer" })).toBe("Elliptical");
    expect(stravaSportForCardio({ name: "Boxing (Bag)", slug: "cardio-boxing-bag" })).toBe(
      "Workout",
    );
  });
});

describe("shouldPostToStrava", () => {
  it("follows the setting unless the workout overrides it", () => {
    expect(shouldPostToStrava({ autoPost: true, stravaPost: null })).toBe(true);
    expect(shouldPostToStrava({ autoPost: false, stravaPost: null })).toBe(false);
    expect(shouldPostToStrava({ autoPost: true, stravaPost: false })).toBe(false);
    expect(shouldPostToStrava({ autoPost: false, stravaPost: true })).toBe(true);
    expect(shouldPostToStrava({ autoPost: true, stravaPost: undefined })).toBe(true);
  });
});
