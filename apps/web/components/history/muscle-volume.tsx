"use client";

import { PAGE_BODY, PageHeader } from "@/components/page-header";
import { db } from "@/lib/db/schema";
import { buildMuscleVolumeSets } from "@/lib/history/muscle-volume-data";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { type WeeklyMuscleVolume, weeklyVolumeByMuscle } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";

const WEEKS_SHOWN = 6;

function WeekVolumeBars({ week, units }: { week: WeeklyMuscleVolume; units: string }) {
  const entries = Object.entries(week.volumeByMuscle).sort((a, b) => b[1] - a[1]);
  const max = entries[0]?.[1] ?? 0;

  if (entries.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-500">No sets logged this week.</p>;
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {entries.map(([muscle, volume]) => (
        <li key={muscle} className="flex items-center gap-2">
          <span className="w-24 shrink-0 truncate text-xs capitalize text-zinc-600 dark:text-zinc-400">
            {muscle}
          </span>
          <div className="h-2 flex-1 rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-2 rounded-full bg-accent"
              style={{ width: `${max > 0 ? (volume / max) * 100 : 0}%` }}
            />
          </div>
          <span className="w-14 shrink-0 text-right text-xs text-zinc-500 dark:text-zinc-500">
            {Math.round(volume).toLocaleString()} {units}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * "Weekly volume by muscle group" (STORIES.md S7). Secondary muscles count
 * at half weight — see `weeklyVolumeByMuscle`'s doc comment in
 * packages/core/src/history/volume-by-muscle.ts for why.
 */
export function MuscleVolume() {
  const settings = useLiveQuery(() => db.settings.get("me"), []) ?? DEFAULT_SETTINGS;
  const rawSessions = useLiveQuery(() => db.sessions.toArray(), []);
  const rawSessionExercises = useLiveQuery(() => db.sessionExercises.toArray(), []);
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  const rawSets = useLiveQuery(() => db.sets.toArray(), []);

  const weeks = useMemo(() => {
    const sets = buildMuscleVolumeSets(
      rawSessions ?? [],
      rawSessionExercises ?? [],
      exercises ?? [],
      rawSets ?? [],
    );
    return weeklyVolumeByMuscle(sets, settings.weekStart).slice(0, WEEKS_SHOWN);
  }, [rawSessions, rawSessionExercises, exercises, rawSets, settings.weekStart]);

  const loading =
    rawSessions === undefined ||
    rawSessionExercises === undefined ||
    exercises === undefined ||
    rawSets === undefined;

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader title="Volume by muscle" back={{ href: "/history", label: "History" }} />
      <div className={PAGE_BODY}>
        {weeks.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-500">
            No workouts finished yet.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {weeks.map((week) => (
              <section key={week.weekStart.toISOString()} className="flex flex-col gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                  Week of {week.weekStart.toLocaleDateString()}
                </h2>
                <WeekVolumeBars week={week} units={settings.units} />
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
