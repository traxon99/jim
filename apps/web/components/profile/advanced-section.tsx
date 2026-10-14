"use client";

import { SWITCH_CLASS } from "@/components/switch-class";
import type { SettingsRow } from "@/lib/db/schema";
import { db } from "@/lib/db/schema";
import { DEFAULT_SETTINGS, patchSettings } from "@/lib/settings";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DprSettings } from "./dpr-settings";

type FeatureKey =
  | "showRpe"
  | "showPaceTracker"
  | "showStrengthHints"
  | "showSetTypes"
  | "showRestStats"
  | "showSetTimer";

/** `defaultOn: false` for a switch that starts off, so a missing value reads as off. */
const FEATURES: { key: FeatureKey; label: string; detail: string; defaultOn?: false }[] = [
  { key: "showRpe", label: "RPE column", detail: "How hard each set felt, logged next to reps" },
  { key: "showPaceTracker", label: "Pace tracker", detail: "Live pace card during a workout" },
  {
    key: "showStrengthHints",
    label: "Strength-standard weights",
    detail: "Beginner to Elite weights under the big lifts",
  },
  {
    key: "showSetTypes",
    label: "Set types",
    detail: "Mark a set as warm-up, working or failure. Off, sets log as working",
  },
  {
    key: "showRestStats",
    label: "Rest stats",
    detail: "Average rest against your target, and each set's rest",
  },
  {
    key: "showSetTimer",
    label: "Working set timer",
    detail: "Start set and End set buttons that time each set",
    defaultOn: false,
  },
];

type AdvancedPatch = Partial<
  Pick<SettingsRow, "advancedFeatures" | FeatureKey | "dprEnabled" | "dprEquipmentIncrements">
>;

/**
 * Settings → Advanced (issue #640): the Advanced features master switch
 * (off is the walkthrough's Simple mode), one switch per advanced feature,
 * and PRP. Saved the moment they change, like every other settings section.
 */
export function AdvancedSection() {
  const cached = useLiveQuery(() => db.settings.get("me"), []);
  const settings = cached ?? DEFAULT_SETTINGS;
  const advancedFeatures = settings.advancedFeatures !== false;
  const [error, setError] = useState<string | null>(null);

  async function save(patch: AdvancedPatch) {
    setError(null);
    const result = await patchSettings(patch);
    if (!result.ok) setError(result.error);
  }

  return (
    <div className="flex w-full flex-col gap-3 text-left">
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
        Features
      </h2>

      <label className="flex min-h-11 items-center justify-between gap-3 text-xs font-medium">
        <span className="flex min-w-0 flex-col gap-0.5">
          Advanced features
          <span className="font-normal text-zinc-500 dark:text-zinc-500">
            Off is Simple mode: just weight and reps
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          aria-checked={advancedFeatures}
          checked={advancedFeatures}
          onChange={(event) => void save({ advancedFeatures: event.target.checked })}
          className={SWITCH_CLASS}
        />
      </label>

      {advancedFeatures ? (
        <div className="flex flex-col gap-1 border-l border-zinc-200 pl-3 dark:border-zinc-800">
          {FEATURES.map((feature) => {
            // PRP reads its calls from RPE, so the column stays while PRP is on.
            const lockedOn = feature.key === "showRpe" && settings.dprEnabled;
            const value = settings[feature.key];
            const checked =
              lockedOn || (feature.defaultOn === false ? value === true : value !== false);
            return (
              <label
                key={feature.key}
                className="flex min-h-11 items-center justify-between gap-3 text-xs font-medium"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  {feature.label}
                  <span className="font-normal text-zinc-500 dark:text-zinc-500">
                    {lockedOn ? "Stays on while PRP is on, since PRP needs it" : feature.detail}
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-checked={checked}
                  checked={checked}
                  disabled={lockedOn}
                  onChange={(event) => void save({ [feature.key]: event.target.checked })}
                  className={SWITCH_CLASS}
                />
              </label>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          Turn on Advanced features to pick which extras show.
        </p>
      )}

      <h2 className="mt-3 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
        Progression
      </h2>
      <DprSettings settings={settings} onSave={save} />
      <Link
        href="/progression"
        data-ripple
        className="flex min-h-11 w-full items-center justify-between rounded-lg border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
      >
        Progression
        <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      </Link>

      {error && <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{error}</p>}
    </div>
  );
}
