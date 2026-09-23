export interface WarmupTemplateItem {
  slug: string;
  sets: number;
  /** Exactly one of reps / seconds, matching the exercise's tracking type. */
  reps?: number;
  seconds?: number;
}

export interface WarmupTemplate {
  /** Stable key — lets the UI tell which templates a user already added. */
  key: string;
  name: string;
  notes: string;
  minutes: number;
  items: readonly WarmupTemplateItem[];
}

/**
 * Ready-made warm-up routines every user can add in one tap (issue #59).
 * Code-defined rather than seeded as rows: routines are strictly
 * user-owned (RLS, ADR-005), so a "template" is instantiated into the
 * user's own warm-up routine rather than shared. Every slug refers to
 * WARMUP_EXERCISES (warmups.test.ts checks this).
 */
export const WARMUP_TEMPLATES: readonly WarmupTemplate[] = [
  {
    key: "full-body",
    name: "Full-body warm-up",
    notes: "General warm-up for any training day.",
    minutes: 10,
    items: [
      { slug: "warmup-jumping-jacks", sets: 1, seconds: 60 },
      { slug: "warmup-arm-circles", sets: 1, reps: 15 },
      { slug: "warmup-cat-cow", sets: 1, reps: 10 },
      { slug: "warmup-hip-circles", sets: 1, reps: 10 },
      { slug: "warmup-leg-swings", sets: 2, reps: 10 },
      { slug: "warmup-worlds-greatest-stretch", sets: 1, reps: 5 },
      { slug: "warmup-bodyweight-squat", sets: 1, reps: 15 },
      { slug: "warmup-inchworm", sets: 1, reps: 5 },
    ],
  },
  {
    key: "legs",
    name: "Leg day warm-up",
    notes: "Hip and lower-body prep before squats, deadlifts and lunges.",
    minutes: 10,
    items: [
      { slug: "warmup-hip-circles", sets: 1, reps: 10 },
      { slug: "warmup-leg-swings", sets: 2, reps: 10 },
      { slug: "warmup-hip-flexor-stretch", sets: 2, seconds: 30 },
      { slug: "warmup-pigeon-stretch", sets: 2, seconds: 30 },
      { slug: "warmup-butterfly-stretch", sets: 1, seconds: 30 },
      { slug: "warmup-glute-bridge", sets: 2, reps: 12 },
      { slug: "warmup-cossack-squat", sets: 1, reps: 8 },
      { slug: "warmup-calf-wall-stretch", sets: 1, seconds: 30 },
      { slug: "warmup-bodyweight-squat", sets: 1, reps: 15 },
    ],
  },
  {
    key: "upper",
    name: "Upper body warm-up",
    notes: "Shoulder and upper-back prep before pressing and pulling.",
    minutes: 8,
    items: [
      { slug: "warmup-arm-circles", sets: 1, reps: 15 },
      { slug: "warmup-band-pull-apart", sets: 2, reps: 15 },
      { slug: "warmup-band-shoulder-dislocates", sets: 1, reps: 10 },
      { slug: "warmup-thoracic-open-book", sets: 1, reps: 8 },
      { slug: "warmup-scapular-push-up", sets: 1, reps: 10 },
      { slug: "warmup-doorway-chest-stretch", sets: 1, seconds: 30 },
      { slug: "warmup-cross-body-shoulder-stretch", sets: 1, seconds: 30 },
      { slug: "warmup-wrist-circles", sets: 1, reps: 10 },
    ],
  },
  {
    key: "full-body-stretch",
    name: "Full-body stretch",
    notes: "Static stretches head to toe — good as a cool-down or mobility day.",
    minutes: 12,
    items: [
      { slug: "warmup-neck-side-stretch", sets: 1, seconds: 30 },
      { slug: "warmup-overhead-triceps-stretch", sets: 1, seconds: 30 },
      { slug: "warmup-wall-biceps-stretch", sets: 1, seconds: 30 },
      { slug: "warmup-wrist-flexor-stretch", sets: 1, seconds: 30 },
      { slug: "warmup-childs-pose", sets: 1, seconds: 45 },
      { slug: "warmup-cobra-stretch", sets: 1, seconds: 30 },
      { slug: "warmup-standing-hamstring-stretch", sets: 1, seconds: 30 },
      { slug: "warmup-standing-quad-stretch", sets: 1, seconds: 30 },
      { slug: "warmup-calf-wall-stretch", sets: 1, seconds: 30 },
    ],
  },
];

export interface InstantiatedWarmupItem {
  id: string;
  exerciseId: string;
  position: number;
  targetSets: number;
  targetRepsLow: number | null;
  targetRepsHigh: number | null;
  targetDurationSeconds: number | null;
}

export interface InstantiatedWarmup {
  routine: {
    id: string;
    name: string;
    notes: string;
    kind: "warmup";
    warmupMinutes: number;
  };
  items: InstantiatedWarmupItem[];
  /** Template slugs with no matching exercise on this device yet (catalog not synced). */
  missingSlugs: string[];
}

/**
 * Turns a template into the data for a new, user-owned warm-up routine,
 * resolving each slug against the exercise ids present locally. Sync
 * bookkeeping and the rest of the row shape are the call site's job (same
 * split as duplicateRoutine).
 */
export function instantiateWarmupTemplate(
  template: WarmupTemplate,
  exerciseIdBySlug: ReadonlyMap<string, string>,
  generateId: () => string,
): InstantiatedWarmup {
  const items: InstantiatedWarmupItem[] = [];
  const missingSlugs: string[] = [];

  for (const entry of template.items) {
    const exerciseId = exerciseIdBySlug.get(entry.slug);
    if (!exerciseId) {
      missingSlugs.push(entry.slug);
      continue;
    }
    items.push({
      id: generateId(),
      exerciseId,
      position: items.length,
      targetSets: entry.sets,
      targetRepsLow: entry.reps ?? null,
      targetRepsHigh: entry.reps ?? null,
      targetDurationSeconds: entry.seconds ?? null,
    });
  }

  return {
    routine: {
      id: generateId(),
      name: template.name,
      notes: template.notes,
      kind: "warmup",
      warmupMinutes: template.minutes,
    },
    items,
    missingSlugs,
  };
}
