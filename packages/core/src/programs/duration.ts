import { DPR_BLOCK_WEEKS, type DprBlockWeeks } from "../dpr/presets";

/** Durations offered in the program editor (issue #216); null = open-ended. */
export const PROGRAM_DURATION_OPTIONS = [4, 6, 8, 10, 12, 16] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ProgramWeekProgress {
  /** 1-based, capped at `total`. */
  week: number;
  total: number;
  /** True once the planned weeks have fully elapsed. */
  finished: boolean;
}

/**
 * "Week N of M" for a program, counted from when it last became active.
 * Null when it has no duration or has never been activated.
 */
export function programWeekProgress(
  program: { durationWeeks: number | null; activatedAt: Date | null },
  now: Date,
): ProgramWeekProgress | null {
  const { durationWeeks: total, activatedAt } = program;
  if (!total || total <= 0 || !activatedAt) return null;
  const elapsedWeeks = Math.floor(
    Math.max(0, now.getTime() - activatedAt.getTime()) / (7 * DAY_MS),
  );
  return {
    week: Math.min(total, elapsedWeeks + 1),
    total,
    finished: elapsedWeeks >= total,
  };
}

export function formatProgramWeek(progress: ProgramWeekProgress): string {
  return progress.finished
    ? `All ${progress.total} weeks done`
    : `Week ${progress.week} of ${progress.total}`;
}

/**
 * The DPR block length (6, 8 or 12) closest to a program's duration, for the
 * setup wizard's preselect; ties go to the shorter block. Null without one.
 */
export function blockWeeksForProgram(durationWeeks: number | null): DprBlockWeeks | null {
  if (!durationWeeks || durationWeeks <= 0) return null;
  let best: DprBlockWeeks = DPR_BLOCK_WEEKS[0];
  for (const weeks of DPR_BLOCK_WEEKS) {
    if (Math.abs(weeks - durationWeeks) < Math.abs(best - durationWeeks)) best = weeks;
  }
  return best;
}
