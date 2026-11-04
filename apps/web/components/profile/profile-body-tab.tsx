"use client";

import { BodyweightChart } from "@/components/bodyweight/bodyweight-chart";
import { PainPicker } from "@/components/injuries/pain-picker";
import {
  TRACKED_MEASUREMENT_KINDS,
  bodyweightSeries,
  measurementSeries,
} from "@/lib/bodyweight/series";
import { db } from "@/lib/db/schema";
import { logPain, sortOpenInjuries } from "@/lib/injuries";
import { useInjuries, useTodayKey } from "@/lib/injuries/use-injuries";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { formatDayKey, injuryAreaLabel, todaysPain } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

const MEASUREMENT_LABELS: Record<(typeof TRACKED_MEASUREMENT_KINDS)[number], string> = {
  waist: "Waist",
  chest: "Chest",
  arms: "Arms",
  body_fat: "Body fat",
  neck: "Neck",
  hips: "Hips",
  thighs: "Thighs",
  calves: "Calves",
};

/** Body tab on your own profile (#752): previews with links to full pages. */
export function ProfileBodyTab() {
  const settings = useLiveQuery(() => db.settings.get("me"), []) ?? DEFAULT_SETTINGS;
  const measurements = useLiveQuery(() => db.bodyMeasurements.toArray(), []) ?? [];
  const injuryData = useInjuries();
  const today = useTodayKey();

  const weightPoints = bodyweightSeries(measurements, settings.units).slice(-30);
  const latestMeasurements = TRACKED_MEASUREMENT_KINDS.map((kind) => {
    const points = measurementSeries(measurements, kind, settings.units);
    const latest = points.at(-1);
    return latest ? { kind, value: latest.value } : null;
  }).filter((row): row is NonNullable<typeof row> => row !== null);

  const injuries = sortOpenInjuries(
    (injuryData?.injuries ?? []).filter((injury) => !injury.healedOn),
  );
  const checkins = injuryData?.checkins ?? [];

  return (
    <div className="flex flex-col gap-5 px-4 py-4">
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Bodyweight</h3>
          <Link href="/profile/weight" className="flex items-center gap-1 text-sm font-medium">
            All
            <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </div>
        <BodyweightChart points={weightPoints} unit={settings.units} />
      </section>

      {latestMeasurements.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Measurements</h3>
            <Link
              href="/profile/measurements"
              className="flex items-center gap-1 text-sm font-medium"
            >
              All
              <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </Link>
          </div>
          <ul className="flex flex-col divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {latestMeasurements.map((row) => (
              <li key={row.kind} className="flex justify-between px-3 py-2 text-sm">
                <span>{MEASUREMENT_LABELS[row.kind]}</span>
                <span className="tabular-nums font-medium">
                  {row.value} {settings.units === "kg" ? "cm" : "in"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Injuries</h3>
          <Link href="/profile/injuries" className="flex items-center gap-1 text-sm font-medium">
            All
            <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </div>
        {injuries.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">No open injuries.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {injuries.map((injury) => {
              const label = injuryAreaLabel(injury.area, injury.side);
              return (
                <li
                  key={injury.id}
                  className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{label}</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-500">
                      Since {formatDayKey(injury.startedOn, today)}
                    </span>
                  </div>
                  <PainPicker
                    value={todaysPain(checkins, injury.id, today)}
                    label={`${label} pain today`}
                    onChange={(level) => void logPain(injury, level, today)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
