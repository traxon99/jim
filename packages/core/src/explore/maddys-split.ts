import type { WarmupTemplate } from "../warmups/templates";
import type { ProgramTemplate, RoutineTemplate } from "./templates";

// Maddy's Workout Split (issue #141), transcribed from her notes. Her
// "8x3" means 8 reps x 3 sets; the trailing letters are the muscle focus
// (Q quads, B glutes, H hamstrings, A abductors), carried over as notes.
// Indented lines in her notes are supersets with the exercise above them.

const FOLDER = "Maddy's Workout Split";

const ankleMobs = [
  { slug: "warmup-wall-ankle-mobilization", sets: 1, reps: 10 },
  { slug: "warmup-four-way-ankle", sets: 1, reps: 10 },
] as const;

const shoulderPrep = [
  { slug: "warmup-band-shoulder-dislocates", sets: 1, reps: 10 },
  { slug: "warmup-band-internal-external-rotation", sets: 1, reps: 10 },
  { slug: "pushups", sets: 1, reps: 10 },
] as const;

function warmup(key: string, day: string, minutes: number, items: WarmupTemplate["items"]) {
  return {
    key: `maddy-${key}-warmup`,
    name: `Maddy's ${day} Warm-up`,
    notes: `Warm-up for ${day} of ${FOLDER}.`,
    minutes,
    items,
  } satisfies WarmupTemplate;
}

const monday: RoutineTemplate = {
  key: "maddy-monday",
  name: "Glutes, Quads & Hamstrings A",
  notes: `${FOLDER} · Monday. Finish with the daily stretch.`,
  warmup: warmup("monday", "Monday", 8, [
    ...ankleMobs,
    { slug: "warmup-sumo-squat", sets: 1, reps: 10 },
    { slug: "warmup-hip-flexor-raise", sets: 1, reps: 10 },
    { slug: "warmup-tibialis-raise", sets: 1, reps: 10 },
  ]),
  items: [
    { slug: "hang-clean", sets: 3, reps: 3, superset: 1 },
    { slug: "curated-toe-taps", sets: 3, reps: 10, superset: 1 },
    { slug: "curated-bulgarian-split-squat", sets: 3, reps: 8, notes: "Focus: quads & glutes" },
    {
      slug: "curated-single-leg-rdl",
      sets: 3,
      reps: 8,
      superset: 2,
      notes: "Focus: hamstrings",
    },
    { slug: "curated-dumbbell-jump-squat", sets: 3, superset: 2 },
    { slug: "leg-extensions", sets: 3, reps: 8, notes: "Focus: quads" },
    {
      slug: "hyperextensions-back-extensions",
      sets: 3,
      reps: 8,
      repsHigh: 12,
      notes: "Focus: glutes & hamstrings",
    },
  ],
};

const tuesday: RoutineTemplate = {
  key: "maddy-tuesday",
  name: "Back & Biceps",
  notes: `${FOLDER} · Tuesday. Finish with 2 exercises from Abs (pick 2).`,
  warmup: warmup("tuesday", "Tuesday", 6, [
    ...ankleMobs,
    { slug: "warmup-band-internal-external-rotation", sets: 1, reps: 10 },
    { slug: "warmup-blackburns", sets: 1, reps: 10 },
    { slug: "pushups", sets: 1, reps: 10 },
  ]),
  items: [
    { slug: "barbell-bench-press-medium-grip", sets: 3, reps: 8 },
    { slug: "pullups", sets: 3, reps: 8 },
    { slug: "one-arm-dumbbell-row", sets: 3, reps: 8, superset: 1 },
    { slug: "curated-plank-hold", sets: 3, superset: 1 },
    { slug: "wide-grip-lat-pulldown", sets: 3, reps: 8 },
    { slug: "preacher-curl", sets: 3, reps: 10, superset: 2 },
    { slug: "curated-decline-sit-up", sets: 3, superset: 2 },
  ],
};

const wednesday: RoutineTemplate = {
  key: "maddy-wednesday",
  name: "Glutes",
  notes: `${FOLDER} · Wednesday. Finish with the daily stretch.`,
  warmup: warmup("wednesday", "Wednesday", 8, [
    ...ankleMobs,
    { slug: "warmup-sumo-squat", sets: 1, reps: 10 },
    { slug: "warmup-active-hamstring-stretch", sets: 1, reps: 10 },
    { slug: "warmup-heel-taps", sets: 1, reps: 10 },
  ]),
  items: [
    { slug: "hack-squat", sets: 3, reps: 8, superset: 1, notes: "Focus: quads & glutes" },
    { slug: "front-box-jump", sets: 3, reps: 5, superset: 1 },
    { slug: "romanian-deadlift", sets: 3, reps: 8, superset: 2, notes: "Focus: hamstrings" },
    { slug: "curated-rebound-hops", sets: 3, reps: 15, superset: 2 },
    { slug: "leg-extensions", sets: 3, reps: 10 },
    { slug: "thigh-adductor", sets: 3, reps: 10, notes: "Focus: glutes" },
  ],
};

const thursday: RoutineTemplate = {
  key: "maddy-thursday",
  name: "Shoulders & Triceps",
  notes: `${FOLDER} · Thursday. Finish with 2 exercises from Abs (pick 2).`,
  warmup: warmup("thursday", "Thursday", 6, [...ankleMobs, ...shoulderPrep]),
  items: [
    { slug: "dumbbell-shoulder-press", sets: 3, reps: 8 },
    { slug: "curated-single-arm-cable-leaning-lateral-raise", sets: 3, reps: 10, superset: 1 },
    { slug: "front-dumbbell-raise", sets: 3, superset: 1 },
    { slug: "reverse-flyes", sets: 3, reps: 8 },
    { slug: "triceps-pushdown", sets: 3, reps: 10, superset: 2 },
    { slug: "cable-crunch", sets: 3, superset: 2 },
    { slug: "barbell-curl", sets: 3, reps: 10, superset: 3 },
    { slug: "dumbbell-bicep-curl", sets: 3, superset: 3 },
  ],
};

const friday: RoutineTemplate = {
  key: "maddy-friday",
  name: "Glutes, Quads & Hamstrings B",
  notes: `${FOLDER} · Friday. Finish with the daily stretch.`,
  warmup: warmup("friday", "Friday", 8, [
    ...ankleMobs,
    { slug: "warmup-sumo-squat", sets: 1, reps: 10 },
    { slug: "warmup-worlds-greatest-stretch", sets: 1, reps: 10 },
    { slug: "warmup-leg-lifts", sets: 1, reps: 10 },
  ]),
  items: [
    { slug: "barbell-hip-thrust", sets: 3, reps: 8, notes: "Focus: glutes" },
    { slug: "dumbbell-step-ups", sets: 3, notes: "Focus: quads & glutes" },
    { slug: "lying-leg-curls", sets: 3, reps: 8, notes: "Focus: hamstrings" },
    { slug: "thigh-abductor", sets: 3, reps: 10, notes: "Focus: abductors" },
  ],
};

const saturday: RoutineTemplate = {
  key: "maddy-saturday",
  name: "Upper Body",
  notes: `${FOLDER} · Saturday.`,
  warmup: warmup("saturday", "Saturday", 5, [...shoulderPrep]),
  items: [
    { slug: "barbell-bench-press-medium-grip", sets: 3, reps: 8 },
    { slug: "incline-hammer-curls", sets: 3, reps: 10 },
    { slug: "seated-cable-rows", sets: 3, reps: 8 },
    { slug: "wide-grip-lat-pulldown", sets: 3, reps: 8 },
    { slug: "face-pull", sets: 3, reps: 8, superset: 1 },
    { slug: "knee-hip-raise-on-parallel-bars", sets: 3, superset: 1 },
    { slug: "cable-one-arm-tricep-extension", sets: 3, reps: 10, superset: 2 },
    { slug: "curated-banded-march", sets: 3, superset: 2 },
  ],
};

export const MADDYS_ABS: RoutineTemplate = {
  key: "maddy-abs",
  name: "Abs (pick 2)",
  notes: `${FOLDER} · Pick 2 of these to finish a session.`,
  items: [
    { slug: "curated-decline-sit-up", sets: 3, reps: 10, notes: "Weighted" },
    { slug: "hanging-leg-raise", sets: 3, reps: 10, notes: "Straight legs" },
    { slug: "dead-bug", sets: 3, reps: 10 },
    { slug: "curated-plank-hold", sets: 1, seconds: 60 },
    { slug: "curated-side-plank", sets: 2, seconds: 60, notes: "1 min each side" },
  ],
};

export const MADDYS_DAILY_STRETCH: WarmupTemplate = {
  key: "maddy-daily-stretch",
  name: "Maddy's Daily Stretch",
  notes: "Daily stretch routine — hold each stretch 30s.",
  minutes: 5,
  items: [
    { slug: "standing-toe-touches", sets: 1, seconds: 30 },
    { slug: "warmup-downward-dog", sets: 1, seconds: 30 },
    { slug: "warmup-kneeling-lunge-fold", sets: 2, seconds: 30 },
    { slug: "warmup-couch-stretch", sets: 2, seconds: 30 },
  ],
};

export const MADDYS_WORKOUT_SPLIT: ProgramTemplate = {
  key: "maddys-workout-split",
  name: FOLDER,
  notes:
    "Six-day split: lower body three times a week, upper body three times, abs and a daily stretch.",
  mode: "weekly",
  days: [
    { weekday: 1, routine: monday },
    { weekday: 2, routine: tuesday },
    { weekday: 3, routine: wednesday },
    { weekday: 4, routine: thursday },
    { weekday: 5, routine: friday },
    { weekday: 6, routine: saturday },
  ],
  extraRoutines: [MADDYS_ABS],
  warmups: [MADDYS_DAILY_STRETCH],
};
