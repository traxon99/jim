"use client";

import { SWITCH_CLASS } from "@/components/switch-class";
import type { SettingsRow } from "@/lib/db/schema";
import { db } from "@/lib/db/schema";
import { DEFAULT_SETTINGS, patchSettings } from "@/lib/settings";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { DprSettings } from "./dpr-settings";

const UNIT_OPTIONS: { value: SettingsRow["units"]; label: string }[] = [
  { value: "lb", label: "lb" },
  { value: "kg", label: "kg" },
];

const REST_OPTIONS = [30, 60, 90, 120, 180, 240, 300];

function formatRest(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} min` : `${minutes}:${String(rest).padStart(2, "0")}`;
}

// Units, default rest, the pace tracker toggle and DPR, saved the moment they
// change — same "no Save button" pattern as ColorSchemeSection. These used to sit in a Save-button
// form on the Profile page alongside bar weight and plates, which nothing in
// the app reads; that form is gone and these two moved here.
export function WorkoutSection() {
  const cached = useLiveQuery(() => db.settings.get("me"), []);
  const units = cached?.units ?? DEFAULT_SETTINGS.units;
  const restSeconds = cached?.defaultRestSeconds ?? DEFAULT_SETTINGS.defaultRestSeconds;
  const showPaceTracker = cached?.showPaceTracker ?? DEFAULT_SETTINGS.showPaceTracker;
  const [error, setError] = useState<string | null>(null);

  // A rest value set before this picker existed may not be one of the
  // presets — keep it selectable rather than silently snapping it.
  const restOptions = REST_OPTIONS.includes(restSeconds)
    ? REST_OPTIONS
    : [...REST_OPTIONS, restSeconds].sort((a, b) => a - b);

  async function save(
    patch: Partial<
      Pick<
        SettingsRow,
        "units" | "defaultRestSeconds" | "showPaceTracker" | "dprEnabled" | "dprEquipmentIncrements"
      >
    >,
  ) {
    setError(null);
    const result = await patchSettings(patch);
    if (!result.ok) setError(result.error);
  }

  return (
    <div className="flex w-full flex-col gap-3 text-left">
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
        Workout
      </h2>

      <div className="flex flex-col gap-1 text-xs font-medium">
        Units
        <div className="flex gap-2">
          {UNIT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                if (option.value !== units) void save({ units: option.value });
              }}
              aria-pressed={units === option.value}
              className={`flex min-h-11 flex-1 items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium ${
                units === option.value
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-zinc-300 bg-white text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1 text-xs font-medium">
        Default rest timer
        <select
          value={restSeconds}
          onChange={(event) => void save({ defaultRestSeconds: Number(event.target.value) })}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        >
          {restOptions.map((seconds) => (
            <option key={seconds} value={seconds}>
              {formatRest(seconds)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex min-h-11 items-center justify-between gap-3 text-xs font-medium">
        Show pace tracker
        <input
          type="checkbox"
          role="switch"
          aria-checked={showPaceTracker}
          checked={showPaceTracker}
          onChange={(event) => void save({ showPaceTracker: event.target.checked })}
          className={SWITCH_CLASS}
        />
      </label>

      <DprSettings settings={cached ?? DEFAULT_SETTINGS} onSave={save} />

      {error && <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{error}</p>}
    </div>
  );
}
