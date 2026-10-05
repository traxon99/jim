import type { ExperienceLevel } from "../dpr/goal";
import type { Muscle } from "../exercises/muscles";
import type { ExerciseUsage } from "../exercises/usage";
import type { ProgramTemplate, RoutineTemplate, RoutineTemplateItem } from "../explore/templates";
import { exerciseCategoryOf } from "../warmups/category";

/**
 * In-app program generation (issue #251): a deterministic, offline
 * generator for users without an MCP client. It answers the questionnaire
 * with a ProgramTemplate — the same shape Explore templates use — so saving
 * goes through the existing template path and the result is an ordinary,
 * editable program.
 */

export type ProgramGoal = "strength" | "hypertrophy" | "general";

export const PROGRAM_GOALS: readonly ProgramGoal[] = ["strength", "hypertrophy", "general"];

/**
 * The equipment choices the questionnaire offers, in the catalog's own
 * vocabulary (free-exercise-db). An exercise is only ever picked when its
 * equipment is one of the chosen values — "other" and unlabeled rows never
 * qualify. The one widening: an E-Z curl bar counts as a barbell.
 */
export const GENERATOR_EQUIPMENT = [
  "barbell",
  "dumbbell",
  "cable",
  "machine",
  "kettlebells",
  "bands",
  "body only",
] as const;

export type GeneratorEquipment = (typeof GENERATOR_EQUIPMENT)[number];

const EQUIPMENT_ALIASES: Readonly<Record<string, GeneratorEquipment>> = {
  "e-z curl bar": "barbell",
};

export const GENERATOR_DAYS_PER_WEEK = [2, 3, 4, 5, 6] as const;
export const GENERATOR_SESSION_MINUTES = [30, 45, 60, 75, 90] as const;

/** The big lifts a user can ask to prioritize — each maps to a movement slot. */
export const FOCUS_LIFTS = [
  "squat",
  "bench",
  "deadlift",
  "overhead-press",
  "row",
  "pull-up",
] as const;

export type FocusLift = (typeof FOCUS_LIFTS)[number];

export interface ProgramQuestionnaire {
  goal: ProgramGoal;
  daysPerWeek: number;
  sessionMinutes: number;
  equipment: readonly GeneratorEquipment[];
  experience: ExperienceLevel;
  focusLifts: readonly FocusLift[];
}

/** The subset of an exercise row the generator reads. */
export interface GeneratorExercise {
  id: string;
  slug: string;
  name: string;
  primaryMuscles: readonly string[];
  equipment: string | null;
  mechanic?: "compound" | "isolation" | null;
  level?: string | null;
  trackingType?: string | null;
  category?: "strength" | "warmup" | "cardio" | null;
  isArchived: boolean;
}

export interface GenerateProgramInput extends ProgramQuestionnaire {
  /** Global catalog exercises (the template path resolves by global slug). */
  exercises: readonly GeneratorExercise[];
  /** From `buildExerciseUsage` — breaks fallback ties toward familiar exercises. */
  usage?: ReadonlyMap<string, ExerciseUsage>;
}

export interface GeneratedProgram {
  template: ProgramTemplate;
  /** Slugs of the exercises filling the focus-lift slots, in focus order — DPR candidates. */
  focusSlugs: string[];
}

type SlotKey =
  | "squat"
  | "hinge"
  | "horizontal-press"
  | "vertical-press"
  | "horizontal-pull"
  | "vertical-pull"
  | "lunge"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "chest-fly"
  | "lateral-raise"
  | "rear-delt"
  | "biceps"
  | "triceps"
  | "calves"
  | "abs";

interface SlotSpec {
  /** Fallback match: the exercise's primary muscles include one of these. */
  muscles: readonly Muscle[];
  /** Fallback match; omitted means either mechanic. */
  mechanic?: "compound" | "isolation";
  /** How the slot is programmed — compounds get the heavier rep ranges. */
  kind: "compound" | "isolation";
  /**
   * Preferred catalog slugs, best first, across every equipment type. The
   * generator keeps the ones the user's equipment allows and indexes into
   * that list by variant, so an "A" day and a "B" day get different lifts.
   */
  staples: readonly string[];
}

const SLOTS: Readonly<Record<SlotKey, SlotSpec>> = {
  squat: {
    muscles: ["quadriceps"],
    mechanic: "compound",
    kind: "compound",
    staples: [
      "barbell-squat",
      "front-squat-clean-grip",
      "hack-squat",
      "leg-press",
      "goblet-squat",
      "dumbbell-squat",
      "smith-machine-squat",
      "front-squats-with-two-kettlebells",
      "squats-with-bands",
      "bodyweight-squat",
    ],
  },
  hinge: {
    muscles: ["hamstrings", "glutes", "lower back"],
    mechanic: "compound",
    kind: "compound",
    staples: [
      "barbell-deadlift",
      "romanian-deadlift",
      "stiff-legged-dumbbell-deadlift",
      "curated-single-leg-rdl",
      "smith-machine-stiff-legged-deadlift",
      "one-arm-kettlebell-swings",
      "kettlebell-one-legged-deadlift",
      "pull-through",
      "band-good-morning",
      "natural-glute-ham-raise",
      "hyperextensions-with-no-hyperextension-bench",
    ],
  },
  "horizontal-press": {
    muscles: ["chest"],
    mechanic: "compound",
    kind: "compound",
    staples: [
      "barbell-bench-press-medium-grip",
      "dumbbell-bench-press",
      "barbell-incline-bench-press-medium-grip",
      "incline-dumbbell-press",
      "machine-bench-press",
      "leverage-chest-press",
      "cable-chest-press",
      "smith-machine-bench-press",
      "one-arm-kettlebell-floor-press",
      "bench-press-with-bands",
      "pushups",
      "push-ups-with-feet-elevated",
    ],
  },
  "vertical-press": {
    muscles: ["shoulders"],
    mechanic: "compound",
    kind: "compound",
    staples: [
      "standing-military-press",
      "dumbbell-shoulder-press",
      "seated-barbell-military-press",
      "arnold-dumbbell-press",
      "machine-shoulder-military-press",
      "leverage-shoulder-press",
      "cable-shoulder-press",
      "alternating-kettlebell-press",
      "kettlebell-arnold-press",
      "shoulder-press-with-bands",
    ],
  },
  "horizontal-pull": {
    muscles: ["middle back"],
    mechanic: "compound",
    kind: "compound",
    staples: [
      "bent-over-barbell-row",
      "one-arm-dumbbell-row",
      "seated-cable-rows",
      "t-bar-row-with-handle",
      "bent-over-two-dumbbell-row",
      "lying-t-bar-row",
      "leverage-high-row",
      "one-arm-kettlebell-row",
      "two-arm-kettlebell-row",
    ],
  },
  "vertical-pull": {
    muscles: ["lats"],
    mechanic: "compound",
    kind: "compound",
    staples: [
      "pullups",
      "wide-grip-lat-pulldown",
      "chin-up",
      "close-grip-front-lat-pulldown",
      "v-bar-pulldown",
      "underhand-cable-pulldowns",
    ],
  },
  lunge: {
    muscles: ["quadriceps", "glutes"],
    mechanic: "compound",
    kind: "compound",
    staples: [
      "curated-bulgarian-split-squat",
      "dumbbell-lunges",
      "split-squat-with-dumbbells",
      "barbell-lunge",
      "dumbbell-step-ups",
      "barbell-step-ups",
      "smith-single-leg-split-squat",
    ],
  },
  quads: {
    muscles: ["quadriceps"],
    mechanic: "isolation",
    kind: "isolation",
    staples: ["leg-extensions", "single-leg-leg-extension"],
  },
  hamstrings: {
    muscles: ["hamstrings"],
    mechanic: "isolation",
    kind: "isolation",
    staples: ["lying-leg-curls", "seated-leg-curl", "standing-leg-curl", "natural-glute-ham-raise"],
  },
  glutes: {
    muscles: ["glutes"],
    kind: "isolation",
    staples: [
      "barbell-hip-thrust",
      "barbell-glute-bridge",
      "pull-through",
      "hip-lift-with-band",
      "single-leg-glute-bridge",
      "butt-lift-bridge",
    ],
  },
  "chest-fly": {
    muscles: ["chest"],
    kind: "isolation",
    staples: [
      "cable-crossover",
      "dumbbell-flyes",
      "butterfly",
      "flat-bench-cable-flyes",
      "incline-dumbbell-flyes",
      "cross-over-with-bands",
    ],
  },
  "lateral-raise": {
    muscles: ["shoulders"],
    mechanic: "isolation",
    kind: "isolation",
    staples: [
      "side-lateral-raise",
      "curated-single-arm-cable-leaning-lateral-raise",
      "cable-seated-lateral-raise",
      "seated-side-lateral-raise",
      "lateral-raise-with-bands",
    ],
  },
  "rear-delt": {
    muscles: ["shoulders"],
    kind: "isolation",
    staples: [
      "face-pull",
      "reverse-flyes",
      "cable-rear-delt-fly",
      "reverse-machine-flyes",
      "band-pull-apart",
    ],
  },
  biceps: {
    muscles: ["biceps"],
    mechanic: "isolation",
    kind: "isolation",
    staples: [
      "barbell-curl",
      "dumbbell-bicep-curl",
      "hammer-curls",
      "ez-bar-curl",
      "standing-biceps-cable-curl",
      "incline-dumbbell-curl",
      "preacher-curl",
    ],
  },
  triceps: {
    muscles: ["triceps"],
    kind: "isolation",
    staples: [
      "triceps-pushdown",
      "lying-triceps-press",
      "triceps-pushdown-rope-attachment",
      "cable-rope-overhead-triceps-extension",
      "dumbbell-one-arm-triceps-extension",
      "kettlebell-overhead-triceps-extension",
      "band-skull-crusher",
      "dips-triceps-version",
      "bench-dips",
    ],
  },
  calves: {
    muscles: ["calves"],
    mechanic: "isolation",
    kind: "isolation",
    staples: [
      "standing-calf-raises",
      "seated-calf-raise",
      "standing-dumbbell-calf-raise",
      "standing-barbell-calf-raise",
      "calf-press-on-the-leg-press-machine",
      "calf-raises-with-bands",
    ],
  },
  abs: {
    muscles: ["abdominals"],
    kind: "isolation",
    staples: [
      "cable-crunch",
      "ab-crunch-machine",
      "plank",
      "flat-bench-lying-leg-raise",
      "crunches",
      "pallof-press",
    ],
  },
};

const FOCUS_SLOT: Readonly<Record<FocusLift, SlotKey>> = {
  squat: "squat",
  bench: "horizontal-press",
  deadlift: "hinge",
  "overhead-press": "vertical-press",
  row: "horizontal-pull",
  "pull-up": "vertical-pull",
};

export const FOCUS_LIFT_LABELS: Readonly<Record<FocusLift, string>> = {
  squat: "Squat",
  bench: "Bench press",
  deadlift: "Deadlift",
  "overhead-press": "Overhead press",
  row: "Row",
  "pull-up": "Pull-up",
};

/** One slot on a day: which movement, and which variant of it (0 = the main lift). */
type DaySlot = readonly [SlotKey, number];

interface DayPlan {
  name: string;
  /** In priority order — a short session keeps the first N. */
  slots: readonly DaySlot[];
}

const FULL_BODY_A: DayPlan = {
  name: "Full Body A",
  slots: [
    ["squat", 0],
    ["horizontal-press", 0],
    ["horizontal-pull", 0],
    ["hamstrings", 0],
    ["lateral-raise", 0],
    ["biceps", 0],
    ["abs", 0],
  ],
};
const FULL_BODY_B: DayPlan = {
  name: "Full Body B",
  slots: [
    ["hinge", 0],
    ["vertical-press", 0],
    ["vertical-pull", 0],
    ["lunge", 0],
    ["chest-fly", 0],
    ["triceps", 0],
    ["calves", 0],
  ],
};
const FULL_BODY_C: DayPlan = {
  name: "Full Body C",
  slots: [
    ["squat", 1],
    ["horizontal-press", 1],
    ["vertical-pull", 1],
    ["glutes", 0],
    ["rear-delt", 0],
    ["biceps", 1],
    ["abs", 1],
  ],
};
const UPPER_A: DayPlan = {
  name: "Upper A",
  slots: [
    ["horizontal-press", 0],
    ["horizontal-pull", 0],
    ["vertical-press", 1],
    ["vertical-pull", 1],
    ["lateral-raise", 0],
    ["triceps", 0],
    ["biceps", 0],
  ],
};
const UPPER_B: DayPlan = {
  name: "Upper B",
  slots: [
    ["vertical-press", 0],
    ["vertical-pull", 0],
    ["horizontal-press", 1],
    ["horizontal-pull", 1],
    ["rear-delt", 0],
    ["biceps", 1],
    ["triceps", 1],
  ],
};
const LOWER_A: DayPlan = {
  name: "Lower A",
  slots: [
    ["squat", 0],
    ["hinge", 1],
    ["lunge", 0],
    ["quads", 0],
    ["calves", 0],
    ["abs", 0],
  ],
};
const LOWER_B: DayPlan = {
  name: "Lower B",
  slots: [
    ["hinge", 0],
    ["squat", 1],
    ["glutes", 0],
    ["hamstrings", 0],
    ["calves", 1],
    ["abs", 1],
  ],
};
const PUSH_A: DayPlan = {
  name: "Push A",
  slots: [
    ["horizontal-press", 0],
    ["vertical-press", 0],
    ["horizontal-press", 2],
    ["lateral-raise", 0],
    ["triceps", 0],
    ["chest-fly", 0],
    ["triceps", 1],
  ],
};
const PULL_A: DayPlan = {
  name: "Pull A",
  slots: [
    ["vertical-pull", 0],
    ["horizontal-pull", 0],
    ["vertical-pull", 1],
    ["rear-delt", 0],
    ["biceps", 0],
    ["horizontal-pull", 1],
    ["biceps", 1],
  ],
};
const LEGS_A: DayPlan = {
  name: "Legs A",
  slots: [
    ["squat", 0],
    ["hinge", 1],
    ["lunge", 0],
    ["hamstrings", 0],
    ["quads", 0],
    ["calves", 0],
    ["abs", 0],
  ],
};
const PUSH_B: DayPlan = {
  name: "Push B",
  slots: [
    ["vertical-press", 0],
    ["horizontal-press", 1],
    ["horizontal-press", 3],
    ["lateral-raise", 1],
    ["chest-fly", 1],
    ["triceps", 2],
    ["triceps", 1],
  ],
};
const PULL_B: DayPlan = {
  name: "Pull B",
  slots: [
    ["horizontal-pull", 0],
    ["vertical-pull", 1],
    ["horizontal-pull", 2],
    ["rear-delt", 1],
    ["biceps", 2],
    ["vertical-pull", 2],
    ["biceps", 1],
  ],
};
const LEGS_B: DayPlan = {
  name: "Legs B",
  slots: [
    ["hinge", 0],
    ["squat", 1],
    ["glutes", 0],
    ["quads", 0],
    ["hamstrings", 1],
    ["calves", 1],
    ["abs", 1],
  ],
};

interface Split {
  name: string;
  /** Parallel to weekdays: 0 = Sunday .. 6 = Saturday. */
  days: readonly DayPlan[];
  weekdays: readonly number[];
}

function splitFor(daysPerWeek: number): Split {
  switch (daysPerWeek) {
    case 2:
      return { name: "Full Body", days: [FULL_BODY_A, FULL_BODY_B], weekdays: [1, 4] };
    case 3:
      return {
        name: "Full Body",
        days: [FULL_BODY_A, FULL_BODY_B, FULL_BODY_C],
        weekdays: [1, 3, 5],
      };
    case 4:
      return {
        name: "Upper/Lower",
        days: [UPPER_A, LOWER_A, UPPER_B, LOWER_B],
        weekdays: [1, 2, 4, 5],
      };
    case 5:
      return {
        name: "Upper/Lower + PPL",
        days: [
          { ...UPPER_A, name: "Upper" },
          { ...LOWER_A, name: "Lower" },
          { ...PUSH_A, name: "Push" },
          { ...PULL_A, name: "Pull" },
          { ...LEGS_B, name: "Legs" },
        ],
        weekdays: [1, 2, 4, 5, 6],
      };
    case 6:
      return {
        name: "Push/Pull/Legs",
        days: [PUSH_A, PULL_A, LEGS_A, PUSH_B, PULL_B, LEGS_B],
        weekdays: [1, 2, 3, 4, 5, 6],
      };
    default:
      throw new Error(`Unsupported days per week: ${daysPerWeek}`);
  }
}

/** Roughly 10 minutes per exercise with rest, warm-up sets included. */
export function exercisesPerSession(sessionMinutes: number): number {
  return Math.max(3, Math.min(7, Math.floor(sessionMinutes / 12)));
}

interface Prescription {
  sets: number;
  reps: number;
  repsHigh: number;
}

type Role = "main" | "compound" | "isolation";

const PRESCRIPTIONS: Readonly<Record<ProgramGoal, Record<Role, Prescription>>> = {
  strength: {
    main: { sets: 5, reps: 3, repsHigh: 5 },
    compound: { sets: 3, reps: 6, repsHigh: 8 },
    isolation: { sets: 3, reps: 8, repsHigh: 12 },
  },
  hypertrophy: {
    main: { sets: 4, reps: 6, repsHigh: 10 },
    compound: { sets: 3, reps: 8, repsHigh: 12 },
    isolation: { sets: 3, reps: 10, repsHigh: 15 },
  },
  general: {
    main: { sets: 3, reps: 5, repsHigh: 8 },
    compound: { sets: 3, reps: 8, repsHigh: 12 },
    isolation: { sets: 2, reps: 10, repsHigh: 15 },
  },
};

function prescribe(goal: ProgramGoal, role: Role, experience: ExperienceLevel): Prescription {
  const base = PRESCRIPTIONS[goal][role];
  // Novices recover from less volume; advanced lifters need a bit more on the big lifts.
  if (experience === "novice") return { ...base, sets: Math.min(base.sets, 3) };
  if (experience === "advanced" && role !== "isolation") return { ...base, sets: base.sets + 1 };
  return base;
}

const GOAL_LABELS: Readonly<Record<ProgramGoal, string>> = {
  strength: "Strength",
  hypertrophy: "Hypertrophy",
  general: "General",
};

const SKIPPED_LEVELS = new Set(["expert"]);

/**
 * Builds a weekly program from the questionnaire. Deterministic: the same
 * answers and catalog always give the same program. Exercises are picked
 * from the slot's staple list (filtered to the chosen equipment), falling
 * back to any matching catalog exercise; a slot nothing fits is dropped.
 */
export function generateProgram(input: GenerateProgramInput): GeneratedProgram {
  const split = splitFor(input.daysPerWeek);
  const perSession = exercisesPerSession(input.sessionMinutes);
  const allowed = new Set<string>(input.equipment);
  const usage = input.usage ?? new Map<string, ExerciseUsage>();
  const focusSlots = new Set(input.focusLifts.map((lift) => FOCUS_SLOT[lift]));

  const eligible = input.exercises.filter(
    (exercise) =>
      !exercise.isArchived &&
      exerciseCategoryOf(exercise) === "strength" &&
      !SKIPPED_LEVELS.has(exercise.level ?? "") &&
      equipmentAllowed(exercise.equipment, allowed),
  );
  const candidatesBySlot = new Map<SlotKey, GeneratorExercise[]>();
  const candidatesFor = (slot: SlotKey) => {
    let list = candidatesBySlot.get(slot);
    if (!list) {
      list = slotCandidates(SLOTS[slot], eligible, usage);
      candidatesBySlot.set(slot, list);
    }
    return list;
  };

  const focusSlugBySlot = new Map<SlotKey, string>();
  const days = split.days.map((day, index) => {
    // Focus lifts jump the queue so a short session never trims them.
    const ordered = [...day.slots].sort(
      (a, b) => focusRank(a, focusSlots) - focusRank(b, focusSlots),
    );
    const used = new Set<string>();
    const picked: { slot: DaySlot; exercise: GeneratorExercise }[] = [];
    for (const slot of ordered) {
      if (picked.length >= perSession) break;
      const exercise = pickVariant(candidatesFor(slot[0]), slot[1], used);
      if (!exercise) continue;
      used.add(exercise.id);
      picked.push({ slot, exercise });
    }
    // Compounds before isolation work, focus lifts first; otherwise plan order.
    picked.sort(
      (a, b) =>
        focusRank(a.slot, focusSlots) - focusRank(b.slot, focusSlots) ||
        kindRank(a.slot) - kindRank(b.slot) ||
        day.slots.indexOf(a.slot) - day.slots.indexOf(b.slot),
    );

    const items = picked.map(({ slot, exercise }, position): RoutineTemplateItem => {
      const isFocus = focusSlots.has(slot[0]) && slot[1] === 0;
      if (isFocus && !focusSlugBySlot.has(slot[0])) focusSlugBySlot.set(slot[0], exercise.slug);
      const kind = SLOTS[slot[0]].kind;
      const role: Role = isFocus || (position === 0 && kind === "compound") ? "main" : kind;
      const rx = prescribe(input.goal, role, input.experience);
      if (exercise.trackingType === "time") {
        return { slug: exercise.slug, sets: rx.sets, seconds: 45 };
      }
      return { slug: exercise.slug, sets: rx.sets, reps: rx.reps, repsHigh: rx.repsHigh };
    });

    const routine: RoutineTemplate = {
      key: `generated-${index}`,
      name: day.name,
      notes: "",
      items,
    };
    return { weekday: split.weekdays[index] ?? index + 1, routine };
  });
  // A day the equipment can't fill at all isn't worth scheduling.
  const filledDays = days.filter((day) => day.routine.items.length > 0);

  const focusSlugs = input.focusLifts.flatMap((lift) => {
    const slug = focusSlugBySlot.get(FOCUS_SLOT[lift]);
    return slug ? [slug] : [];
  });

  const name = `${GOAL_LABELS[input.goal]} ${split.name} · ${input.daysPerWeek} days`;
  const focusNote =
    input.focusLifts.length > 0
      ? ` Focus: ${input.focusLifts.map((lift) => FOCUS_LIFT_LABELS[lift]).join(", ")}.`
      : "";
  return {
    template: {
      key: "generated",
      name,
      notes: `Built by Jim for ${input.daysPerWeek} days a week, about ${input.sessionMinutes} minutes a session.${focusNote}`,
      mode: "weekly",
      days: filledDays,
      extraRoutines: [],
      warmups: [],
    },
    focusSlugs: [...new Set(focusSlugs)],
  };
}

function equipmentAllowed(equipment: string | null, allowed: ReadonlySet<string>): boolean {
  if (equipment === null) return false;
  return allowed.has(EQUIPMENT_ALIASES[equipment] ?? equipment);
}

function focusRank(slot: DaySlot, focusSlots: ReadonlySet<SlotKey>): number {
  return focusSlots.has(slot[0]) && slot[1] === 0 ? 0 : 1;
}

function kindRank(slot: DaySlot): number {
  return SLOTS[slot[0]].kind === "compound" ? 0 : 1;
}

/**
 * Staples first (in listed order), then every other catalog exercise that
 * fits the slot's muscles and mechanic — familiar exercises first, then by
 * name — so the list is stable for a given catalog.
 */
function slotCandidates(
  spec: SlotSpec,
  eligible: readonly GeneratorExercise[],
  usage: ReadonlyMap<string, ExerciseUsage>,
): GeneratorExercise[] {
  const bySlug = new Map(eligible.map((exercise) => [exercise.slug, exercise]));
  const staples = spec.staples.flatMap((slug) => {
    const exercise = bySlug.get(slug);
    return exercise ? [exercise] : [];
  });
  const stapleIds = new Set(staples.map((exercise) => exercise.id));
  const fallback = eligible
    .filter(
      (exercise) =>
        !stapleIds.has(exercise.id) &&
        exercise.primaryMuscles.some((muscle) => spec.muscles.includes(muscle as Muscle)) &&
        (!spec.mechanic || exercise.mechanic === spec.mechanic),
    )
    .sort(
      (a, b) =>
        (usage.get(b.id)?.frequency ?? 0) - (usage.get(a.id)?.frequency ?? 0) ||
        a.name.localeCompare(b.name),
    );
  return [...staples, ...fallback];
}

/** The variant-th candidate, skipping ones already on this day (wrapping around). */
function pickVariant(
  candidates: readonly GeneratorExercise[],
  variant: number,
  used: ReadonlySet<string>,
): GeneratorExercise | undefined {
  if (candidates.length === 0) return undefined;
  for (let offset = 0; offset < candidates.length; offset++) {
    const exercise = candidates[(variant + offset) % candidates.length];
    if (exercise && !used.has(exercise.id)) return exercise;
  }
  return undefined;
}
