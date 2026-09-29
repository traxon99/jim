"use client";

import { PrSparkline } from "@/components/history/pr-sparkline";
import { PAGE_BODY, PageHeader } from "@/components/page-header";
import { db } from "@/lib/db/schema";
import { toPersonalRecordEntries } from "@/lib/history/pr-data";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { STRENGTH_TIER_LABELS } from "@/lib/strength-standards/labels";
import { strengthProfileFromSettings } from "@/lib/strength-standards/profile";
import {
  type PrKind,
  type StrengthStandardTier,
  currentPersonalRecords,
  isRecentPersonalRecord,
  liftStandardThresholds,
  nextTier,
  personalRecordProgression,
  personalRecordStats,
  platesPerSide,
  standardLiftForSlug,
  tierForOneRepMax,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { Medal, Sparkles } from "lucide-react";
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

/** Bronze → silver → gold → platinum for 1–4+ plates a side (issue #237). */
const PLATE_MEDAL_CLASSES = [
  "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
  "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
] as const;

function PlateMedal({ plates }: { plates: number }) {
  const tone = PLATE_MEDAL_CLASSES[Math.min(plates, PLATE_MEDAL_CLASSES.length) - 1];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      <Medal className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
      {plates} {plates === 1 ? "plate" : "plates"}
    </span>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700">
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-zinc-500 dark:text-zinc-500">{label}</span>
    </div>
  );
}

export function PrList() {
  const rawPersonalRecords = useLiveQuery(() => db.personalRecords.toArray(), []);
  // Only needed to leave out PRs from deleted workouts (issue #200).
  const rawSessions = useLiveQuery(() => db.sessions.toArray(), []);
  const rawSessionExercises = useLiveQuery(() => db.sessionExercises.toArray(), []);
  const rawSets = useLiveQuery(() => db.sets.toArray(), []);
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  const settings = useLiveQuery(() => db.settings.get("me"), []) ?? DEFAULT_SETTINGS;

  const strengthProfile = useMemo(() => strengthProfileFromSettings(settings), [settings]);

  // Every live PR row, not just the current bests: the stat tiles count
  // them and the sparklines trace them.
  const entries = useMemo(
    () =>
      toPersonalRecordEntries(
        rawPersonalRecords ?? [],
        rawSessions ?? [],
        rawSessionExercises ?? [],
        rawSets ?? [],
      ),
    [rawPersonalRecords, rawSessions, rawSessionExercises, rawSets],
  );
  const current = useMemo(() => currentPersonalRecords(entries), [entries]);
  // Captured once per load: "New" means set in the last week as of opening the page.
  const now = useMemo(() => new Date(), []);
  const stats = useMemo(() => personalRecordStats(entries, now), [entries, now]);

  const exerciseById = useMemo(() => {
    const map = new Map<string, { name: string; slug: string; equipment: string | null }>();
    for (const exercise of exercises ?? []) {
      map.set(exercise.id, {
        name: exercise.name,
        slug: exercise.slug,
        equipment: exercise.equipment,
      });
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

        const heaviest = records.find((r) => r.kind === "weight")?.value ?? null;
        const plates =
          exercise?.equipment === "barbell" && heaviest != null
            ? platesPerSide(heaviest, settings.units)
            : 0;

        // The 1RM climb reads best; fall back to heaviest weight for lifts
        // that only have one.
        const oneRepMaxProgression = personalRecordProgression(entries, exerciseId, "1rm");
        const progression =
          oneRepMaxProgression.length >= 2
            ? oneRepMaxProgression
            : personalRecordProgression(entries, exerciseId, "weight");

        return {
          exerciseId,
          name: exercise?.name ?? "Unknown exercise",
          records: records.sort((a, b) => a.kind.localeCompare(b.kind)),
          standard,
          plates,
          progression,
          hasRecent: records.some((r) => isRecentPersonalRecord(r, now)),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [current, entries, exerciseById, strengthProfile, settings.units, now]);

  if (
    rawPersonalRecords === undefined ||
    rawSessions === undefined ||
    rawSessionExercises === undefined ||
    rawSets === undefined ||
    exercises === undefined
  ) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader title="Personal records" back={{ href: "/history", label: "History" }} />
      <div className={PAGE_BODY}>
        {byExercise.length > 0 && (
          <div className="allow-pwa-select grid grid-cols-3 gap-2">
            <StatTile label="Current PRs" value={stats.current} />
            <StatTile label="This month" value={stats.thisMonth} />
            <StatTile label="Last 7 days" value={stats.recent} />
          </div>
        )}

        {byExercise.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-500">
            No PRs yet — log a set to get started.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {byExercise.map((group, index) => (
              <section
                key={group.exerciseId}
                className={`card-rise flex flex-col gap-1 rounded-lg border px-3 py-2 ${
                  group.hasRecent
                    ? "border-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,0.18)] dark:border-amber-500"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
                style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <Link
                      href={`/exercises/${group.exerciseId}`}
                      className="text-base font-semibold underline-offset-4 hover:underline"
                    >
                      {group.name}
                    </Link>
                    {group.plates > 0 && <PlateMedal plates={group.plates} />}
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
                  <PrSparkline points={group.progression} />
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
                    <li key={record.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="flex items-center gap-1.5">
                        {PR_KIND_LABELS[record.kind]}
                        {isRecentPersonalRecord(record, now) && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            <Sparkles className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                            New
                          </span>
                        )}
                      </span>
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
      </div>
    </main>
  );
}
