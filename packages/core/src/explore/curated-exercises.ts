import type { Muscle } from "../exercises/muscles";

export interface CuratedExerciseEntry {
  slug: string;
  name: string;
  aliases: readonly string[];
  trackingType: "weight_reps" | "time" | "bodyweight" | "weighted_bodyweight";
  equipment: string;
  mechanic: "compound" | "isolation";
  force: "push" | "pull" | "static" | null;
  primaryMuscles: readonly Muscle[];
  secondaryMuscles: readonly Muscle[];
  instructions: readonly string[];
}

/**
 * Strength exercises Explore templates (issue #141) need that
 * free-exercise-db doesn't ship, seeded as global catalog rows alongside it
 * (packages/db's seed). Slugs carry a "curated-" prefix so they can never
 * collide with a free-exercise-db slug — same trick as the warm-up catalog.
 */
export const CURATED_EXERCISES: readonly CuratedExerciseEntry[] = [
  {
    slug: "curated-bulgarian-split-squat",
    name: "Bulgarian Split Squat",
    aliases: ["bss", "rear foot elevated split squat"],
    trackingType: "weight_reps",
    equipment: "dumbbell",
    mechanic: "compound",
    force: "push",
    primaryMuscles: ["quadriceps", "glutes"],
    secondaryMuscles: ["hamstrings", "adductors"],
    instructions: [
      "Stand a stride in front of a bench and rest the top of your back foot on it, a dumbbell in each hand.",
      "Lower straight down until your back knee nearly touches the floor, front shin roughly vertical.",
      "Drive through the front foot to stand back up. Finish all reps, then switch legs.",
    ],
  },
  {
    slug: "curated-single-leg-rdl",
    name: "Single-Leg RDL",
    aliases: ["sl rdl", "single leg romanian deadlift"],
    trackingType: "weight_reps",
    equipment: "dumbbell",
    mechanic: "compound",
    force: "pull",
    primaryMuscles: ["hamstrings"],
    secondaryMuscles: ["glutes", "lower back"],
    instructions: [
      "Stand on one leg holding a dumbbell in the opposite hand, standing knee softly bent.",
      "Hinge at the hip, reaching the weight toward the floor as the free leg extends straight behind you.",
      "Keep your hips square, then squeeze the glute to return to standing. Switch legs after the set.",
    ],
  },
  {
    slug: "curated-dumbbell-jump-squat",
    name: "Dumbbell Jump Squat",
    aliases: ["db jump squat"],
    trackingType: "weight_reps",
    equipment: "dumbbell",
    mechanic: "compound",
    force: "push",
    primaryMuscles: ["quadriceps"],
    secondaryMuscles: ["glutes", "calves", "hamstrings"],
    instructions: [
      "Hold a light dumbbell in each hand at your sides, feet shoulder-width apart.",
      "Dip into a quarter-to-half squat, then jump as high as you can.",
      "Land softly with bent knees and go straight into the next rep.",
    ],
  },
  {
    slug: "curated-toe-taps",
    name: "Toe Taps",
    aliases: ["box toe taps"],
    trackingType: "bodyweight",
    equipment: "body only",
    mechanic: "compound",
    force: null,
    primaryMuscles: ["calves"],
    secondaryMuscles: ["quadriceps"],
    instructions: [
      "Stand facing a low box or step.",
      "Quickly alternate tapping the ball of each foot on top of the box, staying light on your feet.",
      "Count each tap of both feet as one rep.",
    ],
  },
  {
    slug: "curated-rebound-hops",
    name: "Rebound Hops",
    aliases: ["rb hops", "pogo hops"],
    trackingType: "bodyweight",
    equipment: "body only",
    mechanic: "compound",
    force: "push",
    primaryMuscles: ["calves"],
    secondaryMuscles: ["quadriceps"],
    instructions: [
      "Stand tall with feet hip-width apart and knees nearly straight.",
      "Hop continuously off the balls of your feet, spending as little time on the ground as possible.",
      "Keep the hops quick and springy rather than high.",
    ],
  },
  {
    slug: "curated-decline-sit-up",
    name: "Decline Sit-Up",
    aliases: ["incline sit up", "decline weighted sit up", "weighted sit up"],
    trackingType: "weighted_bodyweight",
    equipment: "other",
    mechanic: "isolation",
    force: "pull",
    primaryMuscles: ["abdominals"],
    secondaryMuscles: [],
    instructions: [
      "Hook your feet under the pads of a decline bench, optionally holding a plate to your chest.",
      "Lower your torso back under control until just short of the bench.",
      "Curl back up to the top without yanking on your neck.",
    ],
  },
  {
    slug: "curated-single-arm-cable-leaning-lateral-raise",
    name: "Single-Arm Cable Leaning Lateral Raise",
    aliases: ["sa cable lat raise", "cable leaning lateral raise", "leaning lateral raise"],
    trackingType: "weight_reps",
    equipment: "cable",
    mechanic: "isolation",
    force: "pull",
    primaryMuscles: ["shoulders"],
    secondaryMuscles: ["traps"],
    instructions: [
      "Stand side-on to a low cable, hold the upright with your near hand and lean away from it.",
      "With your far hand, raise the handle out to the side up to shoulder height, elbow slightly bent.",
      "Lower slowly. Finish all reps, then switch sides.",
    ],
  },
  {
    slug: "curated-banded-march",
    name: "Banded March",
    aliases: ["band march"],
    trackingType: "bodyweight",
    equipment: "bands",
    mechanic: "isolation",
    force: "pull",
    primaryMuscles: ["abdominals"],
    secondaryMuscles: ["quadriceps"],
    instructions: [
      "Loop a mini band around your feet and lie on your back, or stand tall holding a support.",
      "Drive one knee up against the band's resistance, then lower it with control.",
      "Alternate legs, keeping your core braced. Count each leg as one rep.",
    ],
  },
  {
    slug: "curated-plank-hold",
    name: "Plank Hold",
    aliases: ["plank", "timed plank"],
    trackingType: "time",
    equipment: "body only",
    mechanic: "isolation",
    force: "static",
    primaryMuscles: ["abdominals"],
    secondaryMuscles: ["shoulders", "glutes"],
    instructions: [
      "Set up on your forearms and toes, elbows under your shoulders.",
      "Squeeze your glutes and brace your core so your body is a straight line.",
      "Hold without letting your hips sag or pike.",
    ],
  },
  {
    slug: "curated-side-plank",
    name: "Side Plank",
    aliases: ["side plank hold"],
    trackingType: "time",
    equipment: "body only",
    mechanic: "isolation",
    force: "static",
    primaryMuscles: ["abdominals"],
    secondaryMuscles: ["glutes", "shoulders"],
    instructions: [
      "Lie on one side and prop yourself up on your forearm, elbow under the shoulder.",
      "Lift your hips so your body forms a straight line from head to feet.",
      "Hold, then switch sides.",
    ],
  },
];
