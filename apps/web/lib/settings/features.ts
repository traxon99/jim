import type { SettingsRow } from "@/lib/db/schema";

type FeatureSettings = Pick<SettingsRow, "advancedFeatures" | "dprEnabled" | "showRpe">;

/**
 * Whether the set table shows the RPE column (issues #464, #640): its own
 * switch on Settings → Advanced, and not Simple mode. PRP keeps it either
 * way: PRP reads its calls from RPE, so it always needs it. A settings row
 * cached before either setting existed counts as on.
 */
export function showsRpe(settings: FeatureSettings): boolean {
  return (settings.advancedFeatures !== false && settings.showRpe !== false) || settings.dprEnabled;
}

/** Whether the pace tracker card shows during a workout: its own switch, and not Simple mode. */
export function showsPaceTracker(
  settings: Pick<SettingsRow, "advancedFeatures" | "showPaceTracker">,
): boolean {
  return settings.advancedFeatures !== false && settings.showPaceTracker !== false;
}

/**
 * Whether a big lift shows its strength-standard weights (Beginner,
 * Intermediate…) under the set table (issue #640).
 */
export function showsStrengthHints(
  settings: Pick<SettingsRow, "advancedFeatures" | "showStrengthHints">,
): boolean {
  return settings.advancedFeatures !== false && settings.showStrengthHints !== false;
}

/**
 * Whether a set's number opens the warm-up / working / failure menu (issue
 * #640). Off, every new set logs as working; warm-up sets an exercise or
 * routine adds still show as W.
 */
export function showsSetTypes(
  settings: Pick<SettingsRow, "advancedFeatures" | "showSetTypes">,
): boolean {
  return settings.advancedFeatures !== false && settings.showSetTypes !== false;
}

/** Whether rest stats ("Rest avg 1:32 (target 2:00)") and per-set rest tags show (issue #640). */
export function showsRestStats(
  settings: Pick<SettingsRow, "advancedFeatures" | "showRestStats">,
): boolean {
  return settings.advancedFeatures !== false && settings.showRestStats !== false;
}

/**
 * Whether the working set timer (issue #634) shows during a workout: Start
 * set / End set, timing each set, and the set times in summaries and
 * history. Off by default, so unlike the other switches a settings row
 * cached before it existed counts as off.
 */
export function showsSetTimer(
  settings: Pick<SettingsRow, "advancedFeatures" | "showSetTimer">,
): boolean {
  return settings.advancedFeatures !== false && settings.showSetTimer === true;
}

/**
 * Whether to open the setup walkthrough on launch (issue #464): only for a
 * settings row the server sent with `onboardedAt` null, i.e. a new account.
 * No cached row yet (first fetch still in flight), or one cached before the
 * field existed (undefined), never counts.
 */
export function needsSetup(row: Pick<SettingsRow, "onboardedAt"> | undefined): boolean {
  return row !== undefined && row.onboardedAt === null;
}
