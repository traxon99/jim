/**
 * Public profile fields (issues #751/#752): a display name and short bio
 * friends see on profile pages. Stored on `users`, edited through
 * `/api/profile` like the avatar and sharing switches.
 */

export const DISPLAY_NAME_MAX_LENGTH = 50;
export const BIO_MAX_LENGTH = 160;

/** Slugs for the five lift circles on profile headers (mockup screen 5/6). */
export const PROFILE_LIFT_HIGHLIGHTS = [
  { key: "bench", label: "Bench", slug: "barbell-bench-press-medium-grip" },
  { key: "squat", label: "Squat", slug: "barbell-squat" },
  { key: "deadlift", label: "Deadlift", slug: "barbell-deadlift" },
  { key: "ohp", label: "OHP", slug: "standing-military-press" },
  { key: "row", label: "Row", slug: "bent-over-barbell-row" },
] as const;

export type ProfileLiftKey = (typeof PROFILE_LIFT_HIGHLIGHTS)[number]["key"];

export function normalizeDisplayName(input: string): string {
  return input.trim();
}

export function normalizeBio(input: string): string {
  return input.trim();
}

export function displayNameError(name: string): string | null {
  if (name.length > DISPLAY_NAME_MAX_LENGTH) {
    return `Use at most ${DISPLAY_NAME_MAX_LENGTH} characters`;
  }
  return null;
}

export function bioError(bio: string): string | null {
  if (bio.length > BIO_MAX_LENGTH) {
    return `Use at most ${BIO_MAX_LENGTH} characters`;
  }
  return null;
}
