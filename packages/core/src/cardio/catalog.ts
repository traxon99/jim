import type { Muscle } from "../exercises/muscles";

export interface CardioCatalogEntry {
  slug: string;
  name: string;
  aliases: readonly string[];
  /** "time" for work with no meaningful distance (bag rounds); otherwise distance in a time. */
  trackingType: "time" | "distance_time";
  equipment: string;
  primaryMuscles: readonly Muscle[];
  secondaryMuscles: readonly Muscle[];
  instructions: readonly string[];
}

/**
 * Common cardio (issue #423) that free-exercise-db doesn't already have,
 * seeded as global catalog rows next to its own 14 cardio entries (which
 * packages/db's seed reclassifies as cardio and gives everyday aliases like
 * "treadmill run" and "rowing machine"). Slugs carry a "cardio-" prefix so
 * they can never collide with a free-exercise-db slug.
 */
export const CARDIO_EXERCISES: readonly CardioCatalogEntry[] = [
  {
    slug: "cardio-boxing-bag",
    name: "Boxing (Bag)",
    aliases: ["boxing", "heavy bag", "punching bag", "bag work"],
    trackingType: "time",
    equipment: "other",
    primaryMuscles: ["shoulders"],
    secondaryMuscles: ["chest", "triceps", "abdominals", "calves"],
    instructions: [
      "Stand in your fighting stance an arm's length from the bag, hands up by your chin.",
      "Throw punches in short combinations, turning your hips and shoulders into each one.",
      "Keep moving your feet between combinations and bring your hands back to guard.",
      "Log each round as one set, e.g. three rounds of 3:00.",
    ],
  },
  {
    slug: "cardio-running-outdoor",
    name: "Running (Outdoor)",
    aliases: ["run", "running", "outdoor run", "jog", "jogging"],
    trackingType: "distance_time",
    equipment: "body only",
    primaryMuscles: ["quadriceps"],
    secondaryMuscles: ["hamstrings", "glutes", "calves"],
    instructions: [
      "Start with a few minutes of easy jogging to warm up.",
      "Run tall with relaxed shoulders, landing under your hips rather than out in front.",
      "Keep a pace you can hold for the whole distance, then cool down with a walk.",
    ],
  },
  {
    slug: "cardio-incline-walk",
    name: "Incline Walk",
    aliases: ["incline treadmill walk", "treadmill incline walk", "12-3-30"],
    trackingType: "distance_time",
    equipment: "machine",
    primaryMuscles: ["glutes"],
    secondaryMuscles: ["hamstrings", "calves", "quadriceps"],
    instructions: [
      "Set the treadmill to a steep incline and a brisk walking speed.",
      "Walk tall without holding the handrails, so your legs do the work.",
      "Lower the speed or incline if you can't keep going without the rails.",
    ],
  },
  {
    slug: "cardio-walking-outdoor",
    name: "Walking",
    aliases: ["walk", "outdoor walk"],
    trackingType: "distance_time",
    equipment: "body only",
    primaryMuscles: ["quadriceps"],
    secondaryMuscles: ["calves", "glutes", "hamstrings"],
    instructions: [
      "Walk at a brisk pace with your arms swinging naturally.",
      "Keep your head up and take quick, comfortable steps.",
    ],
  },
  {
    slug: "cardio-assault-bike",
    name: "Assault Bike",
    aliases: ["air bike", "echo bike", "fan bike"],
    trackingType: "distance_time",
    equipment: "machine",
    primaryMuscles: ["quadriceps"],
    secondaryMuscles: ["shoulders", "glutes", "hamstrings", "chest"],
    instructions: [
      "Set the seat so your knee is slightly bent at the bottom of each pedal stroke.",
      "Push and pull the handles while you pedal, so arms and legs share the work.",
      "The fan's resistance rises with your effort: go harder to make it harder.",
    ],
  },
  {
    slug: "cardio-skierg",
    name: "SkiErg",
    aliases: ["ski erg", "ski machine"],
    trackingType: "distance_time",
    equipment: "machine",
    primaryMuscles: ["lats"],
    secondaryMuscles: ["triceps", "abdominals", "shoulders"],
    instructions: [
      "Stand facing the machine with a handle in each hand, arms overhead.",
      "Pull the handles down past your hips, hinging at the hips and bending your knees slightly.",
      "Stand back up and let the handles rise before the next pull.",
    ],
  },
  {
    slug: "cardio-swimming",
    name: "Swimming",
    aliases: ["swim", "laps", "pool"],
    trackingType: "distance_time",
    equipment: "other",
    primaryMuscles: ["shoulders"],
    secondaryMuscles: ["lats", "triceps", "abdominals", "quadriceps"],
    instructions: [
      "Warm up with a few easy lengths.",
      "Keep your body long and flat in the water, breathing to the side or front as your stroke allows.",
      "Log the total distance and time for each swim, or each interval as its own set.",
    ],
  },
];
