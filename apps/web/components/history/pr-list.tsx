"use client";

import { db } from "@/lib/db/schema";
import { toPersonalRecordEntries } from "@/lib/history/pr-data";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { STRENGTH_TIER_LABELS } from "@/lib/strength-standards/labels";
import { strengthProfileFromSettings } from "@/lib/strength-standards/profile";
import {
  type PrKind,
  type StrengthStandardTier,
  currentPersonalRecords,
  liftStandardThresholds,
  nextTier,
  standardLiftForSlug,
  tierForOneRepMax,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

const PR_KIND_LABELS: Record<PrKind, string> = {
  "1rm": "Estimated 1RM",
  weight: "Heaviest weight",
  volume: "Best single-set volume",
  reps_at_weight: "Most reps at a weight",
};

function nextTierHint(standard: {
  tier: StrengthStandardTier | null;
  thresholds: Record<StrengthStandardTier, number>;
}): string {
  const upcoming = nextTier(standard.tier);
  if (!upcoming) return "Elite — the top published standard";
  return `${STRENGTH_TIER_LABELS[upcoming]} standard: ${standard.thresholds[upcoming]}`;
}

/** Every PR eligible for classification gets a badge — "Below Beginner" included, rather than none at all. */
function tierBadgeLabel(tier: StrengthStandardTier | null): string {
  return tier ? STRENGTH_TIER_LABELS[tier] : "Below Beginner";
}

export function PrList() {
  const rawPersonalRecords = useLiveQuery(() => db.personalRecords.toArray(), []);
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  const settings = useLiveQuery(() => db.settings.get("me"), []) ?? DEFAULT_SETTINGS;

  const strengthProfile = useMemo(() => strengthProfileFromSettings(settings), [settings]);

  const current = useMemo(
    () => currentPersonalRecords(toPersonalRecordEntries(rawPersonalRecords ?? [])),
    [rawPersonalRecords],
  );

  const exerciseById = useMemo(() => {
    const map = new Map<string, { name: string; slug: string }>();
    for (const exercise of exercises ?? []) {
      map.set(exercise.id, { name: exercise.name, slug: exercise.slug });
    }
    return map;
  }, [exercises]);

  const byExercise = useMemo(() => {
    const groups = new Map<string, typeof current>();
    for (const record of current) {
      const list = groups.get(record.exerciseId);
      if (list) {
        list.push(record);
      } else {
        groups.set(record.exerciseId, [record]);
      }
    }
    return [...groups.entries()]
      .map(([exerciseId, records]) => {
        const exercise = exerciseById.get(exerciseId);
        const standardLift = standardLiftForSlug(exercise?.slug);
        const oneRepMax = records.find((r) => r.kind === "1rm")?.value ?? null;

        const standard =
          standardLift && strengthProfile && oneRepMax
            ? {
                tier: tierForOneRepMax(standardLift, oneRepMax, strengthProfile),
                thresholds: liftStandardThresholds(standardLift, strengthProfile),
              }
            : null;

        return {
          exerciseId,
          name: exercise?.name ?? "Unknown exercise",
          records: records.sort((a, b) => a.kind.localeCompare(b.kind)),
          standard,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [current, exerciseById, strengthProfile]);

  if (rawPersonalRecords === undefined || exercises === undefined) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-4 px-4 py-4">
      <div className="flex items-center gap-2">
        <Link
          href="/history"
          className="flex min-h-11 items-center gap-1 text-sm font-medium text-zinc-500 dark:text-zinc-500"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          History
        </Link>
      </div>
      <h1 className="text-xl font-semibold">Personal records</h1>

      {byExercise.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-500">
          No PRs yet — log a set to get started.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {byExercise.map((group) => (
            <section key={group.exerciseId} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Link
                  href={`/exercises/${group.exerciseId}`}
                  className="text-base font-semibold underline-offset-4 hover:underline"
                >
                  {group.name}
                </Link>
                {group.standard && (
                  <span
                    className={
                      group.standard.tier
                        ? "rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground"
                        : "rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                    }
                  >
                    {tierBadgeLabel(group.standard.tier)}
                  </span>
                )}
              </div>
              {group.standard && (
                <p className="allow-pwa-select text-xs text-zinc-500 dark:text-zinc-500">
                  {group.standard.tier
                    ? nextTierHint(group.standard)
                    : `Beginner standard: ${group.standard.thresholds.beginner}`}
                </p>
              )}
              <ul className="allow-pwa-select flex flex-col divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                {group.records.map((record) => (
                  <li key={record.id} className="flex items-center justify-between py-2">
                    <span>{PR_KIND_LABELS[record.kind]}</span>
                    <span className="flex flex-col items-end">
                      <span className="font-medium">{Math.round(record.value * 100) / 100}</span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-500">
                        {record.achievedAt.toLocaleDateString()}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
