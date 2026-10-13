import { safeNextPath } from "@/lib/pwa/install-gate-exempt";

/**
 * Link to an exercise's card that remembers where it was opened from
 * (#525), so closing it goes back there instead of to the Exercises tab.
 */
export function exerciseCardHref(exerciseId: string, from: string): string {
  return `/exercises/${exerciseId}?from=${encodeURIComponent(from)}`;
}

/** The card's `?from=`, if it's a path on this origin; otherwise none. */
export function exerciseCardReturnPath(from: string | string[] | undefined): string | undefined {
  if (typeof from !== "string") return undefined;
  const path = safeNextPath(from);
  return path === "/" ? undefined : path;
}
