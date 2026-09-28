import type { Muscle } from "../exercises/muscles";
import type { ExerciseUsage } from "../exercises/usage";
import {
  PRIMARY_MUSCLE_VOLUME_WEIGHT,
  SECONDARY_MUSCLE_VOLUME_WEIGHT,
} from "../history/volume-by-muscle";

/**
 * Weekly working-set targets the smart workout (issue #280) balances
 * against. Sets rather than weight × reps, so a leg press's big numbers
 * don't make the legs look "done" next to a curl. Large muscles get more
 * sets than small ones; muscles left out here (neck, forearms, traps…) are
 * worked as secondaries and never picked as a focus.
 */
export const SMART_WORKOUT_WEEKLY_SET_TARGETS: Readonly<Partial<Record<Muscle, number>>> = {
  chest: 10,
  lats: 10,
  "middle back": 8,
  shoulders: 10,
  quadriceps: 10,
  hamstrings: 8,
  glutes: 8,
  biceps: 6,
  triceps: 6,
  calves: 6,
  abdominals: 6,
};

/** How far back "recent volume" looks. */
export const SMART_WORKOUT_LOOKBACK_DAYS = 7;
/** A muscle hit as a primary this recently is still recovering, so it's picked last. */
export const SMART_WORKOUT_RECOVERY_HOURS = 48;
export const SMART_WORKOUT_DEFAULT_EXERCISE_COUNT = 5;
/** Sets each picked exercise is assumed to add, while choosing the rest. */
export const SMART_WORKOUT_SETS_PER_EXERCISE = 3;

/**
 * Well-known lifts per muscle, used to break ties between exercises the
 * user has never done so the fallback is a squat rather than an obscure
 * catalog entry. Every slug here is already referenced by an Explore
 * template or DPR, so it exists in the seeded catalog.
 */
const STAPLE_SLUGS: Readonly<Partial<Record<Muscle, readonly string[]>>> = {
  chest: ["barbell-bench-press-medium-grip", "pushups"],
  lats: ["pullups", "wide-grip-lat-pulldown"],
  "middle back": ["seated-cable-rows", "one-arm-dumbbell-row"],
  shoulders: ["dumbbell-shoulder-press", "curated-single-arm-cable-leaning-lateral-raise"],
  quadriceps: ["barbell-squat", "hack-squat", "leg-extensions"],
  hamstrings: ["romanian-deadlift", "lying-leg-curls"],
  glutes: ["barbell-hip-thrust", "curated-bulgarian-split-squat"],
  biceps: ["barbell-curl", "dumbbell-bicep-curl"],
  triceps: ["triceps-pushdown", "cable-one-arm-tricep-extension"],
  calves: ["standing-calf-raises", "seated-calf-raise"],
  abdominals: ["cable-crunch", "hanging-leg-raise"],
};

export interface SmartWorkoutSet {
  completedAt: Date;
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
}

export interface SmartWorkoutExercise {
  id: string;
  slug: string;
  name: string;
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
  mechanic?: "compound" | "isolation" | null;
}

export interface SmartWorkoutInput {
  now: Date;
  /** Working sets (no warm-ups, no deleted rows); older ones are ignored. */
  sets: readonly SmartWorkoutSet[];
  /** Strength exercises the user can pick from. */
  exercises: readonly SmartWorkoutExercise[];
  /** From `buildExerciseUsage` — exercises the user already does are preferred. */
  usage: ReadonlyMap<string, ExerciseUsage>;
  exerciseCount?: number;
}

export interface SmartWorkoutPick {
  exerciseId: string;
  /** The under-trained muscle this exercise was chosen for. */
  muscle: Muscle;
}

export interface SmartWorkoutPlan {
  picks: SmartWorkoutPick[];
  /** Weighted working sets per target muscle over the lookback window. */
  recentSets: Record<Muscle, number>;
}

const TARGET_MUSCLES = Object.keys(SMART_WORKOUT_WEEKLY_SET_TARGETS) as Muscle[];

/**
 * Builds a workout that fills the biggest gaps in recent training (issue
 * #280). Greedy: each round takes the target muscle furthest below its
 * weekly set target (recovering muscles last), picks the best exercise for
 * it, and counts that exercise's sets before choosing the next — so one
 * big gap doesn't swallow the whole workout. Compounds come first in the
 * returned order.
 */
export function planSmartWorkout(input: SmartWorkoutInput): SmartWorkoutPlan {
  const count = input.exerciseCount ?? SMART_WORKOUT_DEFAULT_EXERCISE_COUNT;
  const nowMs = input.now.getTime();
  const windowStart = nowMs - SMART_WORKOUT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const recoveryStart = nowMs - SMART_WORKOUT_RECOVERY_HOURS * 60 * 60 * 1000;

  const recentSets = Object.fromEntries(TARGET_MUSCLES.map((m) => [m, 0])) as Record<
    Muscle,
    number
  >;
  const recovering = new Set<string>();
  for (const set of input.sets) {
    const time = set.completedAt.getTime();
    if (time < windowStart || time > nowMs) continue;
    for (const muscle of set.primaryMuscles) {
      if (muscle in recentSets) recentSets[muscle as Muscle] += PRIMARY_MUSCLE_VOLUME_WEIGHT;
      if (time >= recoveryStart) recovering.add(muscle);
    }
    for (const muscle of set.secondaryMuscles) {
      if (muscle in recentSets) recentSets[muscle as Muscle] += SECONDARY_MUSCLE_VOLUME_WEIGHT;
    }
  }

  const projected = { ...recentSets };
  const picked = new Set<string>();
  const picks: SmartWorkoutPick[] = [];
  const exerciseById = new Map(input.exercises.map((exercise) => [exercise.id, exercise]));

  while (picks.length < count) {
    const muscles = TARGET_MUSCLES.filter((muscle) =>
      input.exercises.some((e) => !picked.has(e.id) && e.primaryMuscles.includes(muscle)),
    ).sort(
      (a, b) =>
        muscleScore(a, projected, recovering) - muscleScore(b, projected, recovering) ||
        targetOf(b) - targetOf(a) ||
        a.localeCompare(b),
    );
    const muscle = muscles[0];
    if (!muscle) break;

    const exercise = bestExerciseFor(muscle, input, picked, recovering);
    if (!exercise) break;

    picked.add(exercise.id);
    picks.push({ exerciseId: exercise.id, muscle });
    for (const m of exercise.primaryMuscles) {
      if (m in projected) projected[m as Muscle] += SMART_WORKOUT_SETS_PER_EXERCISE;
    }
    for (const m of exercise.secondaryMuscles) {
      if (m in projected) {
        projected[m as Muscle] += SMART_WORKOUT_SETS_PER_EXERCISE * SECONDARY_MUSCLE_VOLUME_WEIGHT;
      }
    }
  }

  // Heavy compound lifts before isolation work; otherwise keep pick order.
  const ordered = picks
    .map((pick, index) => ({ pick, index }))
    .sort((a, b) => {
      const compoundA = exerciseById.get(a.pick.exerciseId)?.mechanic === "compound" ? 0 : 1;
      const compoundB = exerciseById.get(b.pick.exerciseId)?.mechanic === "compound" ? 0 : 1;
      return compoundA - compoundB || a.index - b.index;
    })
    .map(({ pick }) => pick);

  return { picks: ordered, recentSets };
}

function targetOf(muscle: Muscle): number {
  return SMART_WORKOUT_WEEKLY_SET_TARGETS[muscle] ?? 1;
}

function muscleScore(
  muscle: Muscle,
  projected: Readonly<Record<Muscle, number>>,
  recovering: ReadonlySet<string>,
): number {
  // +1 puts every recovering muscle behind every recovered one that's
  // still under target.
  return projected[muscle] / targetOf(muscle) + (recovering.has(muscle) ? 1 : 0);
}

function bestExerciseFor(
  muscle: Muscle,
  input: SmartWorkoutInput,
  picked: ReadonlySet<string>,
  recovering: ReadonlySet<string>,
): SmartWorkoutExercise | undefined {
  const staples = STAPLE_SLUGS[muscle] ?? [];
  let best: { exercise: SmartWorkoutExercise; score: number } | undefined;

  for (const exercise of input.exercises) {
    if (picked.has(exercise.id) || !exercise.primaryMuscles.includes(muscle)) continue;

    let score = 0;
    const usage = input.usage.get(exercise.id);
    // Something the user already does beats anything they don't.
    if (usage) score += 100 + Math.min(usage.frequency, 50);
    const stapleIndex = staples.indexOf(exercise.slug);
    if (stapleIndex >= 0) score += 20 - stapleIndex;
    if (exercise.mechanic === "compound") score += 5;
    // Don't load a muscle that's still recovering as a side effect.
    for (const other of exercise.primaryMuscles) {
      if (other !== muscle && recovering.has(other)) score -= 10;
    }

    if (
      !best ||
      score > best.score ||
      (score === best.score && exercise.name.localeCompare(best.exercise.name) < 0)
    ) {
      best = { exercise, score };
    }
  }
  return best?.exercise;
}
