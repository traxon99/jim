"use client";

import {
  Bandage,
  ChartLine,
  Check,
  ChevronRight,
  Footprints,
  Hourglass,
  type IconComponent,
  Layers,
  Lock,
  Medal,
  SlidersHorizontal,
  Sparkles,
  Timer,
  TrendingUp,
  Zap,
} from "@/components/icons/solar";
import { SWITCH_CLASS } from "@/components/switch-class";
import type { SettingsRow } from "@/lib/db/schema";
import { db } from "@/lib/db/schema";
import { DEFAULT_SETTINGS, patchSettings, showsSetTimer, showsTempo } from "@/lib/settings";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { DprSettings } from "./dpr-settings";
import { IconTile, SETTINGS_GROUP, SETTINGS_ROW } from "./settings-rows";

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

interface Feature<K extends string> {
  key: K;
  label: string;
  icon: IconComponent;
  /** The icon tile's color. */
  tile: string;
  /** `false` for a switch that starts off, so a missing value reads as off. */
  defaultOn?: false;
}

/**
 * The extras behind the Advanced master switch (issue #640), grouped by where
 * they show up (#854). Labels only: what a switch does shows on screen.
 */
const LOGGING: Feature<FeatureKey>[] = [
  { key: "showRpe", label: "RPE", icon: Zap, tile: "bg-blue-500" },
  { key: "showSetTypes", label: "Set types", icon: Layers, tile: "bg-orange-500" },
  { key: "showTempo", label: "Tempo", icon: Hourglass, tile: "bg-pink-500", defaultOn: false },
  { key: "showSetTimer", label: "Set timer", icon: Timer, tile: "bg-cyan-500", defaultOn: false },
];
const DURING: Feature<FeatureKey>[] = [
  { key: "showPaceTracker", label: "Pace tracker", icon: Footprints, tile: "bg-green-500" },
  { key: "showRestStats", label: "Rest stats", icon: ChartLine, tile: "bg-violet-500" },
  { key: "showStrengthHints", label: "Strength standards", icon: Medal, tile: "bg-amber-500" },
];

/**
 * Injury switches (issue #731). Not under the master switch: injuries are a
 * core feature, so these hold in Simple mode too. Both off is tracking only.
 */
const INJURY_SWITCHES: Feature<InjuryKey>[] = [
  { key: "injuriesAffectPrp", label: "Injuries adjust PRP", icon: Bandage, tile: "bg-red-500" },
  { key: "showInjuryHints", label: "Injury suggestions", icon: Sparkles, tile: "bg-blue-500" },
];

const INJURY_RULES: Feature<"showInjuryRules"> = {
  key: "showInjuryRules",
  label: "Injury exercise rules",
  icon: SlidersHorizontal,
  tile: "bg-teal-500",
};

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

function SwitchRow({
  feature,
  checked,
  disabled = false,
  badge,
  onChange,
}: {
  feature: Feature<string>;
  checked: boolean;
  disabled?: boolean;
  badge?: ReactNode;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={SETTINGS_ROW}>
      <IconTile icon={feature.icon} className={feature.tile} />
      <span className="min-w-0 flex-1">{feature.label}</span>
      {badge}
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className={SWITCH_CLASS}
      />
    </label>
  );
}

/**
 * Settings → Advanced (issue #640): Simple or Advanced as two previews of a
 * set row (#854), the advanced extras grouped by where they show, the injury
 * switches (issue #731) and PRP. Saved the moment they change, like every
 * other settings section.
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

  function featureRow(feature: Feature<FeatureKey>) {
    // PRP reads its calls from RPE, so the column stays while PRP is on.
    const lockedOn = feature.key === "showRpe" && settings.dprEnabled;
    const value = settings[feature.key];
    const checked = lockedOn || (feature.defaultOn === false ? value === true : value !== false);
    return (
      <SwitchRow
        key={feature.key}
        feature={feature}
        checked={checked}
        disabled={lockedOn}
        badge={
          lockedOn ? (
            <span className="flex shrink-0 items-center gap-1 rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              <Lock className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
              PRP
            </span>
          ) : undefined
        }
        onChange={(next) => void save({ [feature.key]: next })}
      />
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 text-left">
      <ModePicker
        advanced={advancedFeatures}
        onChange={(next) => void save({ advancedFeatures: next })}
      />

      {advancedFeatures && (
        <>
          <h2 className={`${GROUP_LABEL} mt-4`}>Logging</h2>
          <div className={SETTINGS_GROUP}>
            {LOGGING.map(featureRow)}
            {/* The set timer enables tempo cues (issue #846): they need Start set and a tempo. */}
            {showsSetTimer(settings) && showsTempo(settings) && (
              <TempoCueSettings
                cues={settings.tempoCues === true}
                style={settings.tempoCueStyle ?? "voice"}
                onChange={(patch) => void save(patch)}
              />
            )}
          </div>
          <h2 className={`${GROUP_LABEL} mt-4`}>During a workout</h2>
          <div className={SETTINGS_GROUP}>{DURING.map(featureRow)}</div>
        </>
      )}

      <h2 className={`${GROUP_LABEL} mt-4`}>Injuries</h2>
      <div className={SETTINGS_GROUP}>
        {[...INJURY_SWITCHES, ...(advancedFeatures ? [INJURY_RULES] : [])].map((feature) => (
          <SwitchRow
            key={feature.key}
            feature={feature}
            checked={settings[feature.key] !== false}
            onChange={(next) => void save({ [feature.key]: next })}
          />
        ))}
      </div>

      <h2 className={`${GROUP_LABEL} mt-4`}>Progression</h2>
      <div className={SETTINGS_GROUP}>
        <DprSettings settings={settings} onSave={save} />
        <Link href="/progression?from=settings" data-ripple className={SETTINGS_ROW}>
          <IconTile icon={TrendingUp} className="bg-zinc-500" />
          <span className="min-w-0 flex-1">Progression</span>
          <ChevronRight
            className="h-4 w-4 text-zinc-400 dark:text-zinc-600"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </Link>
      </div>

      {error && <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{error}</p>}
    </div>
  );
}

const GROUP_LABEL = "px-4 text-[13px] font-semibold text-zinc-500 dark:text-zinc-500";

/**
 * Simple or Advanced as two cards (#854), each a small picture of the set
 * row it gives you: weight, reps and ✓; or a warm-up, RPE and the pace bar.
 */
function ModePicker({ advanced, onChange }: { advanced: boolean; onChange: (v: boolean) => void }) {
  const cell =
    "flex h-6 items-center justify-center rounded-md bg-white px-1.5 text-xs font-semibold tabular-nums dark:bg-zinc-800";
  const done = (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
      <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
    </span>
  );
  const todo = <span className="h-6 w-6 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-700" />;
  const options = [
    {
      value: false,
      label: "Simple",
      preview: (
        <>
          <span className="flex items-center gap-1">
            <span className={`${cell} flex-[1.3]`}>185</span>
            <span className={`${cell} flex-1`}>8</span>
            {done}
          </span>
          <span className="flex items-center gap-1">
            <span className={`${cell} flex-[1.3]`}>185</span>
            <span className={`${cell} flex-1`}>8</span>
            {todo}
          </span>
        </>
      ),
    },
    {
      value: true,
      label: "Advanced",
      preview: (
        <>
          <span className="flex items-center gap-1">
            <span className="w-3 text-[10px] font-bold text-orange-500">W</span>
            <span className={`${cell} flex-[1.3]`}>135</span>
            <span className={`${cell} flex-1`}>5</span>
            {done}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 text-[10px] font-bold text-zinc-400">1</span>
            <span className={`${cell} flex-[1.3]`}>185</span>
            <span className={`${cell} flex-1`}>8</span>
            <span className={`${cell} flex-[0.9] text-zinc-500`}>@8</span>
            {todo}
          </span>
          <span className="h-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
            <span className="block h-full w-1/2 rounded-full bg-green-500" />
          </span>
        </>
      ),
    },
  ];
  return (
    <fieldset className="grid w-full min-w-0 grid-cols-2 gap-2.5">
      <legend className="sr-only">Features</legend>
      {options.map((option) => {
        const selected = option.value === advanced;
        return (
          <button
            key={option.label}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`surface press flex flex-col gap-2.5 rounded-3xl border-2 p-3 text-left ${
              selected ? "border-zinc-950 dark:border-zinc-50" : "border-transparent"
            }`}
          >
            <span
              aria-hidden="true"
              className="flex min-h-[74px] flex-col justify-center gap-1.5 rounded-xl bg-zinc-100 p-2 dark:bg-zinc-950"
            >
              {option.preview}
            </span>
            <span className="flex items-center justify-between px-0.5 text-base font-semibold">
              {option.label}
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] ${
                  selected
                    ? "border-zinc-950 bg-zinc-950 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
                    : "border-zinc-300 dark:border-zinc-600"
                }`}
              >
                {selected && <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />}
              </span>
            </span>
          </button>
        );
      })}
    </fieldset>
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
    <div className="flex flex-col pl-[42px]">
      <label className={`${SETTINGS_ROW} justify-between`}>
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
        <fieldset className={`${SETTINGS_ROW} justify-between`}>
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
