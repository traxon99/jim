import type { ExploreProgramTemplate, RoutineTemplate } from "./templates";

// Well-known programs for Explore (issue #243). Each is transcribed in
// Jim's own vocabulary: catalog slugs, sets × a rep range, and notes for
// the parts Jim doesn't model (AMRAP sets, percentage waves). Where a
// program has its own progression rule, `info.dpr` picks the Dynamic
// Progression preset and focus lifts closest to it.

const SQUAT = "barbell-squat";
const BENCH = "barbell-bench-press-medium-grip";
const DEADLIFT = "barbell-deadlift";
const OHP = "standing-military-press";
const ROW = "bent-over-barbell-row";

// ---------------------------------------------------------------------------
// Starting Strength: two alternating full-body days, three times a week.
// ---------------------------------------------------------------------------

const ssA: RoutineTemplate = {
  key: "starting-strength-a",
  name: "Starting Strength A",
  notes: "Starting Strength · Workout A. Alternate with B.",
  items: [
    { slug: SQUAT, sets: 3, reps: 5 },
    { slug: BENCH, sets: 3, reps: 5 },
    { slug: DEADLIFT, sets: 1, reps: 5 },
  ],
};

const ssB: RoutineTemplate = {
  key: "starting-strength-b",
  name: "Starting Strength B",
  notes: "Starting Strength · Workout B. Alternate with A.",
  items: [
    { slug: SQUAT, sets: 3, reps: 5 },
    { slug: OHP, sets: 3, reps: 5 },
    { slug: "power-clean", sets: 5, reps: 3 },
  ],
};

export const STARTING_STRENGTH: ExploreProgramTemplate = {
  key: "starting-strength",
  name: "Starting Strength",
  notes:
    "The classic barbell novice program: squat every session, with two short full-body workouts alternated three days a week.",
  mode: "sequence",
  days: [
    { weekday: null, routine: ssA },
    { weekday: null, routine: ssB },
  ],
  extraRoutines: [],
  warmups: [],
  info: {
    level: "novice",
    daysPerWeek: 3,
    goal: "strength",
    progression: "Add weight every session while you can.",
    dpr: { preset: "aggressive", weeks: 12, focusSlugs: [SQUAT, BENCH, DEADLIFT, OHP] },
  },
};

// ---------------------------------------------------------------------------
// StrongLifts-style 5×5: two alternating days of three lifts.
// ---------------------------------------------------------------------------

const slA: RoutineTemplate = {
  key: "five-by-five-a",
  name: "5×5 Workout A",
  notes: "5×5 · Workout A. Alternate with B.",
  items: [
    { slug: SQUAT, sets: 5, reps: 5 },
    { slug: BENCH, sets: 5, reps: 5 },
    { slug: ROW, sets: 5, reps: 5 },
  ],
};

const slB: RoutineTemplate = {
  key: "five-by-five-b",
  name: "5×5 Workout B",
  notes: "5×5 · Workout B. Alternate with A.",
  items: [
    { slug: SQUAT, sets: 5, reps: 5 },
    { slug: OHP, sets: 5, reps: 5 },
    { slug: DEADLIFT, sets: 1, reps: 5 },
  ],
};

export const FIVE_BY_FIVE: ExploreProgramTemplate = {
  key: "five-by-five",
  name: "5×5 (StrongLifts style)",
  notes:
    "Five sets of five on the big barbell lifts. Two alternating workouts, three days a week, about 45 minutes each.",
  mode: "sequence",
  days: [
    { weekday: null, routine: slA },
    { weekday: null, routine: slB },
  ],
  extraRoutines: [],
  warmups: [],
  info: {
    level: "novice",
    daysPerWeek: 3,
    goal: "strength",
    progression: "Add weight each session you hit all 5×5.",
    dpr: { preset: "aggressive", weeks: 12, focusSlugs: [SQUAT, BENCH, ROW, OHP, DEADLIFT] },
  },
};

// ---------------------------------------------------------------------------
// GZCLP: four rotating days, each with a heavy T1, a volume T2 and a T3.
// ---------------------------------------------------------------------------

const T1 = "T1: last set as many reps as possible";
const T2 = "T2: moderate weight";
const T3 = "T3: last set as many reps as possible";

function gzclpDay(n: number, t1: string, t2: string, t3: string): RoutineTemplate {
  return {
    key: `gzclp-day-${n}`,
    name: `GZCLP Day ${n}`,
    notes: `GZCLP · Day ${n} of 4. Run the days in order.`,
    items: [
      { slug: t1, sets: 5, reps: 3, notes: T1 },
      { slug: t2, sets: 3, reps: 10, notes: T2 },
      { slug: t3, sets: 3, reps: 15, notes: T3 },
    ],
  };
}

export const GZCLP: ExploreProgramTemplate = {
  key: "gzclp",
  name: "GZCLP",
  notes:
    "A tiered linear progression: a heavy triple, a lighter set of ten and a high-rep accessory each day. Four days, run in order.",
  mode: "sequence",
  days: [
    { weekday: null, routine: gzclpDay(1, SQUAT, BENCH, "wide-grip-lat-pulldown") },
    { weekday: null, routine: gzclpDay(2, OHP, DEADLIFT, "one-arm-dumbbell-row") },
    { weekday: null, routine: gzclpDay(3, BENCH, SQUAT, "wide-grip-lat-pulldown") },
    { weekday: null, routine: gzclpDay(4, DEADLIFT, OHP, "one-arm-dumbbell-row") },
  ],
  extraRoutines: [],
  warmups: [],
  info: {
    level: "novice",
    daysPerWeek: 4,
    goal: "strength",
    progression: "Add weight to T1 and T2 lifts each session they're completed.",
    dpr: { preset: "moderate", weeks: 12, focusSlugs: [SQUAT, BENCH, DEADLIFT, OHP] },
  },
};

// ---------------------------------------------------------------------------
// 5/3/1 Boring But Big: four days, a main lift then 5×10 of its partner.
// ---------------------------------------------------------------------------

const WAVE =
  "5/3/1 wave: week 1 3×5, week 2 3×3, week 3 5/3/1 with the last set as many reps as possible, week 4 deload.";
const BBB = "Boring But Big: 5×10 at 50–60% of your training max.";

function bbbDay(
  key: string,
  name: string,
  main: string,
  supplemental: string,
  assistance: RoutineTemplate["items"],
): RoutineTemplate {
  return {
    key: `bbb-${key}`,
    name: `5/3/1 BBB ${name}`,
    notes: `5/3/1 Boring But Big · ${name} day.`,
    items: [
      { slug: main, sets: 3, reps: 3, repsHigh: 5, notes: WAVE },
      { slug: supplemental, sets: 5, reps: 10, notes: BBB },
      ...assistance,
    ],
  };
}

export const FIVE_THREE_ONE_BBB: ExploreProgramTemplate = {
  key: "531-bbb",
  name: "5/3/1 Boring But Big",
  notes:
    "Jim Wendler's 5/3/1 with high-volume supplemental work. One main lift a day on a monthly wave, then 5×10 of its partner lift.",
  mode: "weekly",
  days: [
    {
      weekday: 1,
      routine: bbbDay("press", "Press", OHP, BENCH, [{ slug: "chin-up", sets: 5, reps: 10 }]),
    },
    {
      weekday: 2,
      routine: bbbDay("deadlift", "Deadlift", DEADLIFT, SQUAT, [
        { slug: "hanging-leg-raise", sets: 5, reps: 10 },
      ]),
    },
    {
      weekday: 4,
      routine: bbbDay("bench", "Bench", BENCH, OHP, [
        { slug: "one-arm-dumbbell-row", sets: 5, reps: 10 },
      ]),
    },
    {
      weekday: 5,
      routine: bbbDay("squat", "Squat", SQUAT, DEADLIFT, [
        { slug: "lying-leg-curls", sets: 5, reps: 10 },
      ]),
    },
  ],
  extraRoutines: [],
  warmups: [],
  info: {
    level: "intermediate",
    daysPerWeek: 4,
    goal: "strength",
    progression: "Raise your training max once a month.",
    dpr: { preset: "conservative", weeks: 12, focusSlugs: [SQUAT, BENCH, DEADLIFT, OHP] },
  },
};

// ---------------------------------------------------------------------------
// Push / Pull / Legs: six days, two variations of each.
// ---------------------------------------------------------------------------

const pushA: RoutineTemplate = {
  key: "ppl-push-a",
  name: "PPL Push A",
  notes: "Push / Pull / Legs · Push A.",
  items: [
    { slug: BENCH, sets: 4, reps: 5, repsHigh: 8 },
    { slug: "standing-military-press", sets: 3, reps: 8, repsHigh: 10 },
    { slug: "incline-dumbbell-press", sets: 3, reps: 8, repsHigh: 12 },
    { slug: "side-lateral-raise", sets: 3, reps: 12, repsHigh: 15 },
    { slug: "triceps-pushdown", sets: 3, reps: 10, repsHigh: 15 },
  ],
};

const pullA: RoutineTemplate = {
  key: "ppl-pull-a",
  name: "PPL Pull A",
  notes: "Push / Pull / Legs · Pull A.",
  items: [
    { slug: DEADLIFT, sets: 3, reps: 5 },
    { slug: "pullups", sets: 3, reps: 6, repsHigh: 10 },
    { slug: "seated-cable-rows", sets: 3, reps: 8, repsHigh: 12 },
    { slug: "face-pull", sets: 3, reps: 12, repsHigh: 15 },
    { slug: "barbell-curl", sets: 3, reps: 8, repsHigh: 12 },
  ],
};

const legsA: RoutineTemplate = {
  key: "ppl-legs-a",
  name: "PPL Legs A",
  notes: "Push / Pull / Legs · Legs A.",
  items: [
    { slug: SQUAT, sets: 4, reps: 5, repsHigh: 8 },
    { slug: "romanian-deadlift", sets: 3, reps: 8, repsHigh: 10 },
    { slug: "leg-press", sets: 3, reps: 10, repsHigh: 15 },
    { slug: "lying-leg-curls", sets: 3, reps: 10, repsHigh: 15 },
    { slug: "standing-calf-raises", sets: 4, reps: 10, repsHigh: 15 },
  ],
};

const pushB: RoutineTemplate = {
  key: "ppl-push-b",
  name: "PPL Push B",
  notes: "Push / Pull / Legs · Push B.",
  items: [
    { slug: "dumbbell-shoulder-press", sets: 4, reps: 6, repsHigh: 10 },
    { slug: "barbell-incline-bench-press-medium-grip", sets: 3, reps: 8, repsHigh: 10 },
    { slug: "dumbbell-flyes", sets: 3, reps: 10, repsHigh: 15 },
    { slug: "side-lateral-raise", sets: 3, reps: 12, repsHigh: 15 },
    { slug: "cable-rope-overhead-triceps-extension", sets: 3, reps: 10, repsHigh: 15 },
  ],
};

const pullB: RoutineTemplate = {
  key: "ppl-pull-b",
  name: "PPL Pull B",
  notes: "Push / Pull / Legs · Pull B.",
  items: [
    { slug: ROW, sets: 4, reps: 6, repsHigh: 10 },
    { slug: "wide-grip-lat-pulldown", sets: 3, reps: 8, repsHigh: 12 },
    { slug: "one-arm-dumbbell-row", sets: 3, reps: 8, repsHigh: 12 },
    { slug: "reverse-flyes", sets: 3, reps: 12, repsHigh: 15 },
    { slug: "hammer-curls", sets: 3, reps: 10, repsHigh: 12 },
  ],
};

const legsB: RoutineTemplate = {
  key: "ppl-legs-b",
  name: "PPL Legs B",
  notes: "Push / Pull / Legs · Legs B.",
  items: [
    { slug: "romanian-deadlift", sets: 4, reps: 6, repsHigh: 10 },
    { slug: "front-squat-clean-grip", sets: 3, reps: 6, repsHigh: 10 },
    { slug: "dumbbell-lunges", sets: 3, reps: 10, repsHigh: 12 },
    { slug: "leg-extensions", sets: 3, reps: 12, repsHigh: 15 },
    { slug: "seated-calf-raise", sets: 4, reps: 12, repsHigh: 15 },
  ],
};

export const PUSH_PULL_LEGS: ExploreProgramTemplate = {
  key: "push-pull-legs",
  name: "Push / Pull / Legs",
  notes:
    "Each muscle twice a week across six sessions: pressing, pulling and legs, in two variations each. A heavy compound opens every day.",
  mode: "weekly",
  days: [
    { weekday: 1, routine: pushA },
    { weekday: 2, routine: pullA },
    { weekday: 3, routine: legsA },
    { weekday: 4, routine: pushB },
    { weekday: 5, routine: pullB },
    { weekday: 6, routine: legsB },
  ],
  extraRoutines: [],
  warmups: [],
  info: {
    level: "intermediate",
    daysPerWeek: 6,
    goal: "hypertrophy",
    progression: "Add reps across the range, then add weight.",
    dpr: { preset: "moderate", weeks: 8, focusSlugs: [BENCH, SQUAT, DEADLIFT, ROW, OHP] },
  },
};

// ---------------------------------------------------------------------------
// Upper / Lower: four days, a strength-leaning and a volume-leaning pair.
// ---------------------------------------------------------------------------

const upperA: RoutineTemplate = {
  key: "upper-lower-upper-a",
  name: "Upper A",
  notes: "Upper / Lower · Upper A.",
  items: [
    { slug: BENCH, sets: 4, reps: 6, repsHigh: 8 },
    { slug: ROW, sets: 4, reps: 6, repsHigh: 8 },
    { slug: "dumbbell-shoulder-press", sets: 3, reps: 8, repsHigh: 12 },
    { slug: "wide-grip-lat-pulldown", sets: 3, reps: 10, repsHigh: 12 },
    { slug: "barbell-curl", sets: 3, reps: 10, repsHigh: 12, superset: 1 },
    { slug: "triceps-pushdown", sets: 3, reps: 10, repsHigh: 12, superset: 1 },
  ],
};

const lowerA: RoutineTemplate = {
  key: "upper-lower-lower-a",
  name: "Lower A",
  notes: "Upper / Lower · Lower A.",
  items: [
    { slug: SQUAT, sets: 4, reps: 6, repsHigh: 8 },
    { slug: "romanian-deadlift", sets: 3, reps: 8, repsHigh: 10 },
    { slug: "leg-press", sets: 3, reps: 10, repsHigh: 12 },
    { slug: "lying-leg-curls", sets: 3, reps: 10, repsHigh: 15 },
    { slug: "standing-calf-raises", sets: 4, reps: 10, repsHigh: 15 },
  ],
};

const upperB: RoutineTemplate = {
  key: "upper-lower-upper-b",
  name: "Upper B",
  notes: "Upper / Lower · Upper B.",
  items: [
    { slug: "incline-dumbbell-press", sets: 4, reps: 8, repsHigh: 12 },
    { slug: "pullups", sets: 4, reps: 6, repsHigh: 10 },
    { slug: "seated-cable-rows", sets: 3, reps: 10, repsHigh: 12 },
    { slug: "side-lateral-raise", sets: 3, reps: 12, repsHigh: 15 },
    { slug: "hammer-curls", sets: 3, reps: 10, repsHigh: 12, superset: 1 },
    { slug: "cable-rope-overhead-triceps-extension", sets: 3, reps: 10, repsHigh: 12, superset: 1 },
  ],
};

const lowerB: RoutineTemplate = {
  key: "upper-lower-lower-b",
  name: "Lower B",
  notes: "Upper / Lower · Lower B.",
  items: [
    { slug: DEADLIFT, sets: 3, reps: 5 },
    { slug: "dumbbell-lunges", sets: 3, reps: 10, repsHigh: 12 },
    { slug: "barbell-hip-thrust", sets: 3, reps: 8, repsHigh: 12 },
    { slug: "leg-extensions", sets: 3, reps: 12, repsHigh: 15 },
    { slug: "seated-calf-raise", sets: 4, reps: 12, repsHigh: 15 },
  ],
};

export const UPPER_LOWER: ExploreProgramTemplate = {
  key: "upper-lower",
  name: "Upper / Lower",
  notes:
    "A four-day hypertrophy split: upper and lower body twice a week each, with heavier compounds first and higher-rep accessories after.",
  mode: "weekly",
  days: [
    { weekday: 1, routine: upperA },
    { weekday: 2, routine: lowerA },
    { weekday: 4, routine: upperB },
    { weekday: 5, routine: lowerB },
  ],
  extraRoutines: [],
  warmups: [],
  info: {
    level: "intermediate",
    daysPerWeek: 4,
    goal: "hypertrophy",
    progression: "Add reps across the range, then add weight.",
    dpr: { preset: "moderate", weeks: 8, focusSlugs: [BENCH, SQUAT, ROW, DEADLIFT] },
  },
};

/** Short names for the focus lifts Explore's program cards list (issue #243). */
export const EXPLORE_LIFT_LABELS: Readonly<Record<string, string>> = {
  [SQUAT]: "Squat",
  [BENCH]: "Bench",
  [DEADLIFT]: "Deadlift",
  [OHP]: "Press",
  [ROW]: "Row",
};
