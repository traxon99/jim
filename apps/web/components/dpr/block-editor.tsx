"use client";

import type { DprBlockLiftRow, DprBlockRow, ExerciseRow, SettingsRow } from "@/lib/db/schema";
import { updateBlockFocus } from "@/lib/dpr/block";
import type { DprSnapshot } from "@/lib/dpr/data";
import { patchSettings } from "@/lib/settings";
import {
  DPR_MAX_FOCUS,
  DPR_PRESET_NAMES,
  type DprPresetName,
  exerciseDisplayName,
  focusCandidates,
} from "@jim/core";
import { useMemo, useState } from "react";
import { PRESET_LABELS, presetSummary } from "./labels";

/**
 * Mid-block changes (issue #211): the preset only changes future calls —
 * goals stay as the block set them — and focus adds or removes lifts.
 */
export function BlockEditor({
  block,
  lifts,
  exercises,
  snapshot,
  settings,
}: {
  block: DprBlockRow;
  lifts: readonly DprBlockLiftRow[];
  exercises: readonly ExerciseRow[];
  snapshot: DprSnapshot;
  settings: SettingsRow;
}) {
  const current = useMemo(() => lifts.map((lift) => lift.exerciseId), [lifts]);
  const [focus, setFocus] = useState<string[]>(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Current lifts stay listed even if they've dropped out of the top 10.
  const options = useMemo(() => {
    const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
    const candidates = focusCandidates(snapshot.usageRows, exercises, new Date()).map(
      (c) => c.exercise,
    );
    const extra = current
      .filter((id) => !candidates.some((c) => c.id === id))
      .map((id) => byId.get(id))
      .filter((exercise): exercise is ExerciseRow => exercise !== undefined);
    return [...extra, ...candidates];
  }, [exercises, snapshot, current]);

  const changed = focus.length !== current.length || focus.some((id, i) => current[i] !== id);

  async function savePreset(preset: DprPresetName) {
    setError(null);
    const result = await patchSettings({ dprAggressiveness: preset });
    if (!result.ok) setError(result.error);
  }

  async function saveFocus() {
    setSaving(true);
    await updateBlockFocus(block, lifts, focus, snapshot);
    setSaving(false);
  }

  function toggle(id: string) {
    setFocus((list) =>
      list.includes(id)
        ? list.filter((x) => x !== id)
        : list.length >= DPR_MAX_FOCUS
          ? list
          : [...list, id],
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
          Aggressiveness
        </h2>
        {DPR_PRESET_NAMES.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={settings.dprAggressiveness === preset}
            onClick={() => void savePreset(preset)}
            className={`flex min-h-11 flex-col items-start gap-0.5 rounded-lg border px-4 py-3 text-left ${
              settings.dprAggressiveness === preset
                ? "border-accent"
                : "border-zinc-300 dark:border-zinc-700"
            }`}
          >
            <span className="text-base font-medium">{PRESET_LABELS[preset]}</span>
            <span className="text-xs text-zinc-500 dark:text-zinc-500">
              {presetSummary(preset, block.experience)}
            </span>
          </button>
        ))}
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          Changes future weight calls. This block's goals stay as they are.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
          Focused lifts ({focus.length}/{DPR_MAX_FOCUS})
        </h2>
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {options.map((exercise) => (
            <li key={exercise.id}>
              <label className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate">{exerciseDisplayName(exercise)}</span>
                <input
                  type="checkbox"
                  checked={focus.includes(exercise.id)}
                  disabled={!focus.includes(exercise.id) && focus.length >= DPR_MAX_FOCUS}
                  onChange={() => toggle(exercise.id)}
                  className="h-5 w-5 accent-accent"
                />
              </label>
            </li>
          ))}
        </ul>
        {changed && (
          <button
            type="button"
            disabled={saving || focus.length === 0}
            onClick={() => void saveFocus()}
            className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save focus"}
          </button>
        )}
      </div>

      {error && <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{error}</p>}
    </section>
  );
}
