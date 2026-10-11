/** The setup walkthrough's steps, in order (issue #464). Welcome isn't counted as a step. */
export const SETUP_STEPS = ["welcome", "gym", "program", "features", "prp", "look"] as const;

export type SetupStep = (typeof SETUP_STEPS)[number];

/** Where finishing or skipping setup leads: back to Settings if it was opened there, else Home. */
export function setupExitHref(from: string | null): string {
  return from === "settings" ? "/profile/settings" : "/home";
}

/** The path the walkthrough lives at. */
export const SETUP_PATH = "/profile/setup";
