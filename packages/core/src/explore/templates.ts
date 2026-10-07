import type { ExperienceLevel } from "../dpr/goal";
import type { DprBlockWeeks, DprPresetName } from "../dpr/presets";
import type { WarmupTemplate, WarmupTemplateItem } from "../warmups/templates";

export interface RoutineTemplateItem extends WarmupTemplateItem {
  /** Upper end of a rep range (e.g. 8-12) — `reps` is the low end. */
  repsHigh?: number;
  /** Items sharing a number are done back to back as a superset. */
  superset?: number;
  notes?: string;
}

/**
 * A ready-made strength routine offered on the Explore tab (issue #141).
 * Like warm-up templates it's code-defined and instantiated into the
 * user's own rows — routines are strictly user-owned (RLS, ADR-005).
 */
export interface RoutineTemplate {
  /** Stable key — lets the UI tell which templates a user already added. */
  key: string;
  name: string;
  notes: string;
  /** Instantiated as its own warm-up routine and linked as this routine's warm-up. */
  warmup?: WarmupTemplate;
  items: readonly RoutineTemplateItem[];
}

export interface ProgramTemplateDay {
  /**
   * 0 = Sunday .. 6 = Saturday, matching program_routines.weekday. Null in a
   * sequence program, where the days rotate in order instead.
   */
  weekday: number | null;
  routine: RoutineTemplate;
}

/** How a program template sets up Dynamic Progression when it's added (issue #243). */
export interface ProgramTemplateDpr {
  preset: DprPresetName;
  weeks: DprBlockWeeks;
  /** Catalog slugs of the lifts DPR should progress, at most DPR_MAX_FOCUS. */
  focusSlugs: readonly string[];
}

/** What Explore's program cards show and filter on (issue #243). */
export interface ProgramTemplateInfo {
  level: ExperienceLevel;
  daysPerWeek: number;
  goal: "strength" | "hypertrophy" | "general";
  /** One line on how the program progresses, shown on its card. */
  progression: string;
  dpr: ProgramTemplateDpr | null;
}

/** A program plus the routines it schedules, added together in one tap. */
export interface ProgramTemplate {
  key: string;
  name: string;
  notes: string;
  mode: "weekly" | "sequence";
  days: readonly ProgramTemplateDay[];
  /** Routines that come with the program but aren't on its schedule (e.g. an abs finisher). */
  extraRoutines: readonly RoutineTemplate[];
  /** Standalone warm-up/stretch routines that come with the program. */
  warmups: readonly WarmupTemplate[];
}

/** Every exercise slug a routine template references, warm-up included. */
export function routineTemplateSlugs(template: RoutineTemplate): string[] {
  return [
    ...(template.warmup?.items.map((item) => item.slug) ?? []),
    ...template.items.map((item) => item.slug),
  ];
}

export interface InstantiatedRoutineItem {
  id: string;
  exerciseId: string;
  position: number;
  supersetGroup: number | null;
  targetSets: number;
  targetRepsLow: number | null;
  targetRepsHigh: number | null;
  targetDurationSeconds: number | null;
  notes: string | null;
}

export interface InstantiatedRoutine {
  routine: { id: string; name: string; notes: string; kind: "strength" };
  items: InstantiatedRoutineItem[];
  /** Template slugs with no matching exercise on this device yet (catalog not synced). */
  missingSlugs: string[];
}

/**
 * Turns a routine template into the data for a new, user-owned strength
 * routine (its warm-up is instantiated separately via
 * instantiateWarmupTemplate). Same split as that function: sync
 * bookkeeping and the rest of the row shape are the call site's job.
 */
export function instantiateRoutineTemplate(
  template: RoutineTemplate,
  exerciseIdBySlug: ReadonlyMap<string, string>,
  generateId: () => string,
): InstantiatedRoutine {
  const items: InstantiatedRoutineItem[] = [];
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
      supersetGroup: entry.superset ?? null,
      targetSets: entry.sets,
      targetRepsLow: entry.reps ?? null,
      targetRepsHigh: entry.repsHigh ?? entry.reps ?? null,
      targetDurationSeconds: entry.seconds ?? null,
      notes: entry.notes ?? null,
    });
  }

  return {
    routine: { id: generateId(), name: template.name, notes: template.notes, kind: "strength" },
    items,
    missingSlugs,
  };
}

/** A program offered on Explore: a template plus what its card shows (issue #243). */
export interface ExploreProgramTemplate extends ProgramTemplate {
  info: ProgramTemplateInfo;
}
