import { MUSCLES, type Muscle } from "../exercises/muscles";

/**
 * Injury areas (issue #627, CONTEXT.md "Injury area"): one muscle from the
 * controlled list or one joint. A joint stands for a fixed set of muscles
 * around it, so "knee" affects every exercise that works the quads,
 * hamstrings or calves. Shoulders and lower back are already muscles.
 */
export const JOINT_MUSCLES = {
  knee: ["quadriceps", "hamstrings", "calves"],
  elbow: ["biceps", "triceps", "forearms"],
  wrist: ["forearms"],
  hip: ["glutes", "adductors", "abductors"],
  ankle: ["calves"],
} as const satisfies Record<string, readonly Muscle[]>;

export type Joint = keyof typeof JOINT_MUSCLES;
export const JOINTS = Object.keys(JOINT_MUSCLES) as Joint[];

export type InjuryArea = Muscle | Joint;
export const INJURY_AREAS: readonly InjuryArea[] = [...JOINTS, ...MUSCLES];

export function isInjuryArea(value: string): value is InjuryArea {
  return (INJURY_AREAS as readonly string[]).includes(value);
}

export function isJoint(area: string): area is Joint {
  return Object.hasOwn(JOINT_MUSCLES, area);
}

/** The muscles an area stands for: a joint's fixed set, or the muscle itself. */
export function areaMuscles(area: string): readonly string[] {
  return isJoint(area) ? JOINT_MUSCLES[area] : [area];
}

export const INJURY_SIDES = ["left", "right", "both"] as const;
export type InjurySide = (typeof INJURY_SIDES)[number];

/** Areas on the body's center line, which have no side. */
const UNPAIRED = new Set<string>(["abdominals", "lower back", "middle back", "neck"]);

/** Whether an area comes in a left and right one, so a report asks which. */
export function isPairedArea(area: string): boolean {
  return !UNPAIRED.has(area);
}

/** The longest note a report keeps, in the app and the MCP. */
export const INJURY_NOTE_MAX = 500;

/** "lower back" → "Lower back", for area names in lists. */
export function capitalizeArea(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** e.g. "Left knee", "Both shoulders", "Lower back". */
export function injuryAreaLabel(area: string, side: InjurySide | string | null): string {
  if (!side || !isPairedArea(area)) return capitalizeArea(area);
  return `${capitalizeArea(side)} ${area}`;
}
