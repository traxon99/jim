import type { forceEnum, levelEnum, mechanicEnum } from "../schema";

type Mechanic = (typeof mechanicEnum.enumValues)[number];
type Force = (typeof forceEnum.enumValues)[number];
type Level = (typeof levelEnum.enumValues)[number];

const MECHANICS: readonly string[] = ["compound", "isolation"] satisfies Mechanic[];
const FORCES: readonly string[] = ["push", "pull", "static"] satisfies Force[];
const LEVELS: readonly string[] = ["beginner", "intermediate", "expert"] satisfies Level[];

/**
 * The third-party dataset is not under our control. A value outside the db enum would make the
 * insert (and so the deploy) fail, so anything unrecognised becomes null instead.
 */
function oneOf<T extends string>(allowed: readonly string[], value: unknown): T | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return allowed.includes(normalized) ? (normalized as T) : null;
}

export const parseMechanic = (value: unknown) => oneOf<Mechanic>(MECHANICS, value);
export const parseForce = (value: unknown) => oneOf<Force>(FORCES, value);
export const parseLevel = (value: unknown) => oneOf<Level>(LEVELS, value);
