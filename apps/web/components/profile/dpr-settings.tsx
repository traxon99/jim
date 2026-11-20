"use client";

import { ArrowUpDown } from "@/components/icons/solar";
import { SWITCH_CLASS } from "@/components/switch-class";
import type { SettingsRow } from "@/lib/db/schema";
import { DEFAULT_INCREMENTS, type EquipmentBucket, normalizeDecimalInput } from "@jim/core";
import { IconTile, SETTINGS_ROW } from "./settings-rows";

const BUCKET_LABELS: Record<EquipmentBucket, string> = {
  barbell: "Barbell",
  "ez-bar": "EZ bar",
  dumbbell: "Dumbbell",
  machine: "Machine",
  cable: "Cable",
  kettlebell: "Kettlebell",
  other: "Other",
};

type DprPatch = Partial<Pick<SettingsRow, "dprEnabled" | "dprEquipmentIncrements">>;

/**
 * Settings → Advanced's Dynamic Progression controls (issue #203): the on/off
 * toggle, and while on, the per-equipment weight steps DPR rounds to.
 * Turning DPR off keeps its blocks and focus, so turning it back on picks
 * up where it left off.
 */
export function DprSettings({
  settings,
  onSave,
}: {
  settings: SettingsRow;
  onSave: (patch: DprPatch) => Promise<void>;
}) {
  const units = settings.units;
  const overrides = settings.dprEquipmentIncrements;

  function saveStep(bucket: EquipmentBucket, raw: string) {
    const value = Number(raw);
    const next = { ...overrides, [bucket]: { ...overrides[bucket] } };
    if (
      !raw ||
      !Number.isFinite(value) ||
      value <= 0 ||
      value === DEFAULT_INCREMENTS[bucket][units]
    ) {
      delete next[bucket]?.[units];
    } else {
      (next[bucket] as Record<string, number>)[units] = value;
    }
    if (Object.keys(next[bucket] ?? {}).length === 0) delete next[bucket];
    void onSave({ dprEquipmentIncrements: next });
  }

  return (
    <>
      <label className={SETTINGS_ROW}>
        <IconTile icon={ArrowUpDown} className="bg-green-600" />
        <span className="min-w-0 flex-1">PRP</span>
        <input
          type="checkbox"
          role="switch"
          aria-checked={settings.dprEnabled}
          checked={settings.dprEnabled}
          onChange={(event) => void onSave({ dprEnabled: event.target.checked })}
          className={SWITCH_CLASS}
        />
      </label>

      {settings.dprEnabled && (
        <details className="px-4 text-xs">
          <summary className="flex min-h-12 cursor-pointer items-center pl-[42px] text-base">
            Weight steps ({units})
          </summary>
          <div className="grid grid-cols-2 gap-2 pb-3 pl-[42px]">
            {(Object.keys(BUCKET_LABELS) as EquipmentBucket[]).map((bucket) => (
              <label key={bucket} className="flex flex-col gap-1 font-medium">
                {BUCKET_LABELS[bucket]}
                <input
                  type="text"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  defaultValue={overrides[bucket]?.[units] ?? DEFAULT_INCREMENTS[bucket][units]}
                  key={`${bucket}-${units}-${overrides[bucket]?.[units] ?? "default"}`}
                  onBlur={(event) => saveStep(bucket, normalizeDecimalInput(event.target.value))}
                  className="rounded-xl bg-zinc-100 px-3 py-2 text-base text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50"
                />
              </label>
            ))}
          </div>
        </details>
      )}
    </>
  );
}
