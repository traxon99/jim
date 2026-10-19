"use client";

import type { SettingsRow } from "@/lib/db/schema";
import { db } from "@/lib/db/schema";
import { DEFAULT_SETTINGS, autoEndWorkoutMinutes, patchSettings } from "@/lib/settings";
import { AUTO_END_OPTIONS, IDLE_REMINDER_MINUTES, formatIdleMinutes } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";

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

// Units and default rest, saved the moment they change (the advanced
// feature switches and PRP moved to Settings → Advanced, issue #640) — same "no Save button" pattern as ColorSchemeSection. These used to sit in a Save-button
// form on the Profile page alongside bar weight and plates, which nothing in
// the app reads; that form is gone and these two moved here.
export function WorkoutSection() {
  const cached = useLiveQuery(() => db.settings.get("me"), []);
  const units = cached?.units ?? DEFAULT_SETTINGS.units;
  const restSeconds = cached?.defaultRestSeconds ?? DEFAULT_SETTINGS.defaultRestSeconds;
  const autoEnd = autoEndWorkoutMinutes(cached ?? DEFAULT_SETTINGS);
  const [error, setError] = useState<string | null>(null);

  // A rest value set before this picker existed may not be one of the
  // presets — keep it selectable rather than silently snapping it.
  const autoEndOptions =
    autoEnd === null || (AUTO_END_OPTIONS as readonly number[]).includes(autoEnd)
      ? [...AUTO_END_OPTIONS]
      : [...AUTO_END_OPTIONS, autoEnd].sort((a, b) => a - b);
  const restOptions = REST_OPTIONS.includes(restSeconds)
    ? REST_OPTIONS
    : [...REST_OPTIONS, restSeconds].sort((a, b) => a - b);

  async function save(
    patch: Partial<Pick<SettingsRow, "units" | "defaultRestSeconds" | "autoEndWorkoutMinutes">>,
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

      <label className="flex flex-col gap-1 text-xs font-medium">
        End idle workouts after
        <select
          value={autoEnd ?? "off"}
          aria-label="End idle workouts after"
          onChange={(event) =>
            void save({
              autoEndWorkoutMinutes:
                event.target.value === "off" ? null : Number(event.target.value),
            })
          }
          className="min-w-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        >
          <option value="off">Off</option>
          {autoEndOptions.map((minutes) => (
            <option key={minutes} value={minutes}>
              {formatIdleMinutes(minutes)}
            </option>
          ))}
        </select>
        <span className="font-normal text-zinc-500 dark:text-zinc-400">
          With notifications on, Jim asks if you're still working out after{" "}
          {formatIdleMinutes(IDLE_REMINDER_MINUTES)} with nothing logged, and lets you know when it
          ends a workout.
        </span>
      </label>

      {error && <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{error}</p>}
    </div>
  );
}
