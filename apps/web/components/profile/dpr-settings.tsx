"use client";

import { SWITCH_CLASS } from "@/components/switch-class";
import type { SettingsRow } from "@/lib/db/schema";
import { DEFAULT_INCREMENTS, type EquipmentBucket } from "@jim/core";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

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
 * Settings → Workout's Dynamic Progression controls (issue #203): the on/off
 * toggle, and while on, a link to /progression plus the per-equipment weight
 * steps DPR rounds to. Turning DPR off keeps its blocks and focus, so turning
 * it back on picks up where it left off.
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
    <div className="flex flex-col gap-3">
      <label className="flex min-h-11 items-center justify-between gap-3 text-xs font-medium">
        <span className="flex flex-col gap-0.5">
          Dynamic Progression
          <span className="font-normal text-zinc-500 dark:text-zinc-500">
            Weight calls from your reps and RPE
          </span>
        </span>
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
        <>
          <Link
            href="/progression"
            className="flex min-h-11 items-center justify-between rounded-lg border border-zinc-300 px-3 text-sm font-medium dark:border-zinc-700"
          >
            Progression
            <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </Link>

          <details className="text-xs">
            <summary className="min-h-11 cursor-pointer py-3 font-medium">
              Weight steps ({units})
            </summary>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(BUCKET_LABELS) as EquipmentBucket[]).map((bucket) => (
                <label key={bucket} className="flex flex-col gap-1 font-medium">
                  {BUCKET_LABELS[bucket]}
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    defaultValue={overrides[bucket]?.[units] ?? DEFAULT_INCREMENTS[bucket][units]}
                    key={`${bucket}-${units}-${overrides[bucket]?.[units] ?? "default"}`}
                    onBlur={(event) => saveStep(bucket, event.target.value)}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                  />
                </label>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
