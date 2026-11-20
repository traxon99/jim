"use client";

import { ChevronRight } from "@/components/icons/solar";
import { SWITCH_CLASS } from "@/components/switch-class";
import type { SettingsRow } from "@/lib/db/schema";
import { db } from "@/lib/db/schema";
import { DEFAULT_SETTINGS, patchSettings, showsSetTimer, showsTempo } from "@/lib/settings";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useState } from "react";
import { DprSettings } from "./dpr-settings";

type FeatureKey =
  | "showRpe"
  | "showPaceTracker"
  | "showStrengthHints"
  | "showSetTypes"
  | "showRestStats"
  | "showSetTimer"
  | "showTempo"
  | "showInjuryRules";

type InjuryKey = "injuriesAffectPrp" | "showInjuryHints";

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
  {
    key: "showTempo",
    label: "Tempo",
    detail: "A lifting tempo per exercise in routines, shown during workouts",
    defaultOn: false,
  },
];

/**
 * Injury switches (issue #731). Not under the master switch: injuries are a
 * core feature, so these hold in Simple mode too. Both off is tracking only.
 */
const INJURY_SWITCHES: { key: InjuryKey; label: string; detail: string }[] = [
  {
    key: "injuriesAffectPrp",
    label: "Injuries adjust PRP",
    detail: "Light days while injured and easing back in after. Off, PRP ignores injuries",
  },
  {
    key: "showInjuryHints",
    label: "Injury suggestions",
    detail: "Go light, swap or skip hints on affected exercises during a workout",
  },
];

const INJURY_RULES = {
  key: "showInjuryRules",
  label: "Injury exercise rules",
  detail: "Set how each injury treats specific exercises: a weight cap, rep range or note",
} as const;

type AdvancedPatch = Partial<
  Pick<
    SettingsRow,
    | "advancedFeatures"
    | FeatureKey
    | InjuryKey
    | "dprEnabled"
    | "dprEquipmentIncrements"
    | "tempoCues"
    | "tempoCueStyle"
  >
>;

/**
 * Settings → Advanced (issue #640): the Advanced features master switch
 * (off is the walkthrough's Simple mode), one switch per advanced feature,
 * the injury switches (issue #731) and PRP. Saved the moment they change,
 * like every other settings section.
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
          {/* The set timer enables tempo cues (issue #846): they need Start set and a tempo. */}
          {showsSetTimer(settings) && showsTempo(settings) && (
            <TempoCueSettings
              cues={settings.tempoCues === true}
              style={settings.tempoCueStyle ?? "voice"}
              onChange={(patch) => void save(patch)}
            />
          )}
        </div>
      ) : (
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          Turn on Advanced features to pick which extras show.
        </p>
      )}

      <h2 className="mt-3 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
        Injuries
      </h2>
      {[...INJURY_SWITCHES, ...(advancedFeatures ? [INJURY_RULES] : [])].map((feature) => {
        const checked = settings[feature.key] !== false;
        return (
          <label
            key={feature.key}
            className="flex min-h-11 items-center justify-between gap-3 text-xs font-medium"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              {feature.label}
              <span className="font-normal text-zinc-500 dark:text-zinc-500">{feature.detail}</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              aria-checked={checked}
              checked={checked}
              onChange={(event) => void save({ [feature.key]: event.target.checked })}
              className={SWITCH_CLASS}
            />
          </label>
        );
      })}
      {settings.injuriesAffectPrp === false && settings.showInjuryHints === false && (
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          Injuries are tracking only: you still log them and check in, and nothing else changes.
        </p>
      )}

      <h2 className="mt-3 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
        Progression
      </h2>
      <DprSettings settings={settings} onSave={save} />
      <Link
        href="/progression?from=settings"
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

const CUE_STYLES = [
  { value: "voice", label: "Voice" },
  { value: "sounds", label: "Sounds" },
] as const;

/** Tempo cues and their style, indented under Tempo (issue #846). */
function TempoCueSettings({
  cues,
  style,
  onChange,
}: {
  cues: boolean;
  style: "voice" | "sounds";
  onChange: (patch: { tempoCues?: boolean; tempoCueStyle?: "voice" | "sounds" }) => void;
}) {
  return (
    <div className="flex flex-col gap-1 border-l border-zinc-200 pl-3 dark:border-zinc-800">
      <label className="flex min-h-11 items-center justify-between gap-3 text-xs font-medium">
        Tempo cues
        <input
          type="checkbox"
          role="switch"
          aria-checked={cues}
          checked={cues}
          onChange={(event) => onChange({ tempoCues: event.target.checked })}
          className={SWITCH_CLASS}
        />
      </label>
      {cues && (
        <fieldset className="flex min-h-11 items-center justify-between gap-3 text-xs font-medium">
          <legend className="float-left">Cues</legend>
          <div className="flex shrink-0 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800">
            {CUE_STYLES.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={style === option.value}
                onClick={() => onChange({ tempoCueStyle: option.value })}
                className={`min-h-10 rounded-md px-3 text-xs font-medium ${
                  style === option.value
                    ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-zinc-50"
                    : "text-zinc-600 dark:text-zinc-400"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
