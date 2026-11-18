import type { SessionDetailExercise } from "@/lib/history/session-detail-entries";
import type {
  AchievementCardInput,
  PrCardInput,
  RoutineIconColor,
  ShareCardExercise,
  WorkoutCardInput,
} from "@jim/core";

/** What a card needs beyond the data it's about: who's sharing it, and the routine's color. */
export interface CardExtras {
  /** Server data: null while loading or offline, and the footer then leaves it off. */
  username: string | null;
  routineColor: RoutineIconColor | null;
  /** The user's bodyweight on the card's date, in their units; null when none is logged. */
  bodyweight: number | null;
}

/** A finished workout's exercises as the card model reads them. */
export function cardExercises(groups: readonly SessionDetailExercise[]): ShareCardExercise[] {
  return groups.map((group) => ({
    name: group.exerciseName,
    isWarmup: group.isWarmup,
    isCardio: group.isCardio,
    sets: group.sets.map((set) => ({
      kind: set.kind,
      weight: set.weight,
      reps: set.reps,
      durationSeconds: set.durationSeconds,
      distance: set.distance,
      prKinds: set.prKinds,
    })),
  }));
}

export function workoutCardInput(
  workout: {
    name: string | null;
    startedAt: Date;
    endedAt: Date | null;
    units: "lb" | "kg";
    groups: readonly SessionDetailExercise[];
  },
  extras: CardExtras,
): WorkoutCardInput {
  return {
    name: workout.name,
    startedAt: workout.startedAt,
    endedAt: workout.endedAt,
    units: workout.units,
    routineColor: extras.routineColor,
    exercises: cardExercises(workout.groups),
    username: extras.username,
    bodyweight: extras.bodyweight,
  };
}

export function prCardInput(
  record: Omit<PrCardInput, "routineColor" | "username" | "bodyweight">,
  extras: CardExtras,
): PrCardInput {
  return {
    ...record,
    routineColor: extras.routineColor,
    username: extras.username,
    bodyweight: extras.bodyweight,
  };
}

export function achievementCardInput(
  achievement: Omit<AchievementCardInput, "routineColor" | "username">,
  extras: CardExtras,
): AchievementCardInput {
  return { ...achievement, routineColor: extras.routineColor, username: extras.username };
}
