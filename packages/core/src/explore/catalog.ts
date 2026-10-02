import { WARMUP_TEMPLATES, type WarmupTemplate } from "../warmups/templates";
import {
  FIVE_BY_FIVE,
  FIVE_THREE_ONE_BBB,
  GZCLP,
  PUSH_PULL_LEGS,
  STARTING_STRENGTH,
  UPPER_LOWER,
} from "./programs";
import type { ExploreProgramTemplate, RoutineTemplate } from "./templates";

/** Explore's "Programs" section, in display order: novice first (issue #243). */
export const PROGRAM_TEMPLATES: readonly ExploreProgramTemplate[] = [
  STARTING_STRENGTH,
  FIVE_BY_FIVE,
  GZCLP,
  UPPER_LOWER,
  PUSH_PULL_LEGS,
  FIVE_THREE_ONE_BBB,
];

/** Explore's "Routines" section: every program's routines, offered one at a time too. */
export const ROUTINE_TEMPLATES: readonly RoutineTemplate[] = PROGRAM_TEMPLATES.flatMap(
  (program) => [...program.days.map((day) => day.routine), ...program.extraRoutines],
);

/** Explore's "Warm-ups & stretches" section. */
export const EXPLORE_WARMUP_TEMPLATES: readonly WarmupTemplate[] = WARMUP_TEMPLATES;
