import { WARMUP_TEMPLATES, type WarmupTemplate } from "../warmups/templates";
import { MADDYS_DAILY_STRETCH, MADDYS_WORKOUT_SPLIT } from "./maddys-split";
import type { ProgramTemplate, RoutineTemplate } from "./templates";

/** Explore's "Programs" section, in display order (issue #141). */
export const PROGRAM_TEMPLATES: readonly ProgramTemplate[] = [MADDYS_WORKOUT_SPLIT];

/** Explore's "Routines" section: every program's routines, offered one at a time too. */
export const ROUTINE_TEMPLATES: readonly RoutineTemplate[] = PROGRAM_TEMPLATES.flatMap(
  (program) => [...program.days.map((day) => day.routine), ...program.extraRoutines],
);

/** Explore's "Warm-ups & stretches" section. */
export const EXPLORE_WARMUP_TEMPLATES: readonly WarmupTemplate[] = [
  ...WARMUP_TEMPLATES,
  MADDYS_DAILY_STRETCH,
];
