import type { SettingsRow } from "@/lib/db/schema";

type FeatureSettings = Pick<SettingsRow, "advancedFeatures" | "dprEnabled">;

/**
 * Whether the set table shows the RPE column (issue #464). Simple mode hides
 * it, unless PRP is on: PRP reads its calls from RPE, so it always needs it.
 * A settings row cached before `advancedFeatures` existed counts as on.
 */
export function showsRpe(settings: FeatureSettings): boolean {
  return settings.advancedFeatures !== false || settings.dprEnabled;
}

/** Whether the pace tracker card shows during a workout: its own switch, and not Simple mode. */
export function showsPaceTracker(
  settings: Pick<SettingsRow, "advancedFeatures" | "showPaceTracker">,
): boolean {
  return settings.advancedFeatures !== false && settings.showPaceTracker !== false;
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
