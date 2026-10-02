"use client";

import { PostToFriendsButton } from "@/components/friends/post-to-friends-button";
import { PrSparkline } from "@/components/history/pr-sparkline";
import { LoadingText } from "@/components/loading-text";
import { PAGE_BODY, PageHeader } from "@/components/page-header";
import { db } from "@/lib/db/schema";
import { recordPostDraft } from "@/lib/friends/post-drafts";
import { toPersonalRecordEntries } from "@/lib/history/pr-data";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { STRENGTH_TIER_LABELS } from "@/lib/strength-standards/labels";
import { strengthProfileFromSettings } from "@/lib/strength-standards/profile";
import {
  type PersonalRecordSortKey,
  type PrKind,
  RECENT_PR_SECTION_DAYS,
  type StrengthStandardTier,
  currentPersonalRecords,
  filterExercises,
  isRecentPersonalRecord,
  liftStandardThresholds,
  nextTier,
  personalRecordProgression,
  personalRecordStats,
  platesPerSide,
  recentPersonalRecords,
  searchExercises,
  sortPersonalRecordGroups,
  standardLiftForSlug,
  tierForOneRepMax,
  tracksRepsAtWeight,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronDown, Medal, SlidersHorizontal, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const PR_KIND_LABELS: Record<PrKind, string> = {
  "1rm": "Estimated 1RM",
  weight: "Heaviest weight",
  volume: "Best single-set volume",
  reps_at_weight: "Most reps at a weight",
};

/** Which PR a collapsed card leads with, in order of preference. */
const HEADLINE_KINDS: readonly PrKind[] = ["1rm", "weight", "volume", "reps_at_weight"];

const SORT_OPTIONS: { value: PersonalRecordSortKey; label: string }[] = [
  { value: "recent", label: "Most recent" },
  { value: "heaviest", label: "Heaviest" },
  { value: "name", label: "Alphabetical" },
];

/** Cards rendered before "Show more", so hundreds of PRs stay quick to open. */
const PAGE_SIZE = 25;

/** How many rows the "Recent PRs" section lists before deferring to the cards. */
const RECENT_LIMIT = 5;

const SELECT_CLASS =
  "flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

function formatValue(value: number): number {
  return Math.round(value * 100) / 100;
}

function NewBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-950 dark:text-amber-300">
      <Sparkles className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
      New
    </span>
  );
}

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
  // "Most reps at a weight" rows logged for loaded exercises before issue
  // #354 stopped recording them are left out too.
  const entries = useMemo(() => {
    const repsAtWeightIds = new Set(
      (exercises ?? []).filter((e) => tracksRepsAtWeight(e.trackingType)).map((e) => e.id),
    );
    return toPersonalRecordEntries(
      rawPersonalRecords ?? [],
      rawSessions ?? [],
      rawSessionExercises ?? [],
      rawSets ?? [],
    ).filter((entry) => entry.kind !== "reps_at_weight" || repsAtWeightIds.has(entry.exerciseId));
  }, [rawPersonalRecords, rawSessions, rawSessionExercises, rawSets, exercises]);
  const current = useMemo(() => currentPersonalRecords(entries), [entries]);
  // Captured once per load: "New" means set in the last week as of opening the page.
  const now = useMemo(() => new Date(), []);
  const stats = useMemo(() => personalRecordStats(entries, now), [entries, now]);

  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState("");
  const [equipment, setEquipment] = useState("");
  const [sortKey, setSortKey] = useState<PersonalRecordSortKey>("recent");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const activeFilters = [muscle, equipment].filter(Boolean).length;
  const narrowed = query.trim() !== "" || activeFilters > 0;

  const exerciseById = useMemo(
    () => new Map((exercises ?? []).map((exercise) => [exercise.id, exercise])),
    [exercises],
  );

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

        const headlineRecord =
          HEADLINE_KINDS.map((kind) => records.find((r) => r.kind === kind)).find(Boolean) ??
          records[0];

        return {
          exerciseId,
          name: exercise?.name ?? "Unknown exercise",
          records: records.sort((a, b) => a.kind.localeCompare(b.kind)),
          headlineRecord,
          headline: oneRepMax ?? heaviest,
          latestAt: new Date(Math.max(...records.map((r) => r.achievedAt.getTime()))),
          standard,
          plates,
          progression,
          hasRecent: records.some((r) => isRecentPersonalRecord(r, now)),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [current, entries, exerciseById, strengthProfile, settings.units, now]);

  // Muscle and equipment choices come only from exercises that have PRs,
  // so no filter option can empty the page on its own.
  const prExercises = useMemo(
    () =>
      byExercise
        .map((group) => exerciseById.get(group.exerciseId))
        .filter((exercise) => exercise !== undefined),
    [byExercise, exerciseById],
  );
  const { muscleOptions, equipmentOptions } = useMemo(() => {
    const muscles = new Set<string>();
    const equipmentSet = new Set<string>();
    for (const exercise of prExercises) {
      for (const m of exercise.primaryMuscles) muscles.add(m);
      for (const m of exercise.secondaryMuscles) muscles.add(m);
      if (exercise.equipment) equipmentSet.add(exercise.equipment);
    }
    return { muscleOptions: [...muscles].sort(), equipmentOptions: [...equipmentSet].sort() };
  }, [prExercises]);

  const visibleGroups = useMemo(() => {
    const sorted = sortPersonalRecordGroups(byExercise, sortKey);
    if (!narrowed) return sorted;
    const filtered = filterExercises(prExercises, {
      muscle: muscle || undefined,
      equipment: equipment || undefined,
      includeArchived: true,
    });
    // A search ranks by relevance, like the exercise list; filters alone keep the chosen sort.
    const ranked = query.trim() ? searchExercises(filtered, query) : filtered;
    const rank = new Map(ranked.map((exercise, index) => [exercise.id, index]));
    const matches = sorted.filter((group) => rank.has(group.exerciseId));
    return query.trim()
      ? matches.sort((a, b) => (rank.get(a.exerciseId) ?? 0) - (rank.get(b.exerciseId) ?? 0))
      : matches;
  }, [byExercise, sortKey, narrowed, prExercises, muscle, equipment, query]);

  const recent = useMemo(
    () => recentPersonalRecords(entries, now).slice(0, RECENT_LIMIT),
    [entries, now],
  );

  // Any change to what's listed starts the paging over.
  function resetting<T>(set: (value: T) => void) {
    return (value: T) => {
      set(value);
      setVisibleCount(PAGE_SIZE);
    };
  }

  function toggleExpanded(exerciseId: string) {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(exerciseId)) next.delete(exerciseId);
      else next.add(exerciseId);
      return next;
    });
  }

  if (
    rawPersonalRecords === undefined ||
    rawSessions === undefined ||
    rawSessionExercises === undefined ||
    rawSets === undefined ||
    exercises === undefined
  ) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <LoadingText />
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

        {byExercise.length > 0 && (
          <div className="flex gap-2">
            <input
              type="search"
              inputMode="search"
              placeholder="Search your PRs"
              aria-label="Search exercises with PRs"
              value={query}
              onChange={(event) => resetting(setQuery)(event.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
              aria-label={activeFilters > 0 ? `Filters, ${activeFilters} on` : "Filters"}
              className={`relative flex min-h-11 min-w-12 shrink-0 items-center justify-center rounded-lg border ${
                filtersOpen || activeFilters > 0
                  ? "border-accent text-zinc-950 dark:text-zinc-50"
                  : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
              }`}
            >
              <SlidersHorizontal className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
              {activeFilters > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-semibold text-accent-foreground">
                  {activeFilters}
                </span>
              )}
            </button>
          </div>
        )}

        {filtersOpen && byExercise.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <select
                value={muscle}
                onChange={(event) => resetting(setMuscle)(event.target.value)}
                aria-label="Muscle"
                className={SELECT_CLASS}
              >
                <option value="">All muscles</option>
                {muscleOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={equipment}
                onChange={(event) => resetting(setEquipment)(event.target.value)}
                aria-label="Equipment"
                className={SELECT_CLASS}
              >
                <option value="">All equipment</option>
                {equipmentOptions.map((eq) => (
                  <option key={eq} value={eq}>
                    {eq}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-500">
              Sort by
              <select
                value={sortKey}
                onChange={(event) =>
                  resetting(setSortKey)(event.target.value as PersonalRecordSortKey)
                }
                className={SELECT_CLASS}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {!narrowed && recent.length > 0 && (
          <section className="flex flex-col gap-1">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
              Recent PRs · last {RECENT_PR_SECTION_DAYS} days
            </h2>
            <ul className="allow-pwa-select flex flex-col divide-y divide-zinc-200 rounded-lg border border-amber-300 px-3 text-sm dark:divide-zinc-800 dark:border-amber-800">
              {recent.map((record) => (
                <li key={record.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="flex min-w-0 flex-col">
                    <Link
                      href={`/exercises/${record.exerciseId}`}
                      className="truncate font-medium underline-offset-4 hover:underline"
                    >
                      {exerciseById.get(record.exerciseId)?.name ?? "Unknown exercise"}
                    </Link>
                    <span className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-500">
                      {PR_KIND_LABELS[record.kind]}
                      {isRecentPersonalRecord(record, now) && <NewBadge />}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    <span className="font-medium">{formatValue(record.value)}</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-500">
                      {record.achievedAt.toLocaleDateString()}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {byExercise.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-500">
            No PRs yet — log a set to get started.
          </p>
        ) : visibleGroups.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-500">
            No exercises with PRs match.
          </p>
        ) : (
          <section className="flex flex-col gap-3">
            {!narrowed && (
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                All exercises · {byExercise.length}
              </h2>
            )}
            {visibleGroups.slice(0, visibleCount).map((group, index) => {
              const isExpanded = expanded.has(group.exerciseId);
              const detailsId = `pr-details-${group.exerciseId}`;
              return (
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
                  <button
                    type="button"
                    onClick={() => toggleExpanded(group.exerciseId)}
                    aria-expanded={isExpanded}
                    aria-controls={detailsId}
                    className="allow-pwa-select flex min-h-11 items-center justify-between gap-2 text-left text-sm"
                  >
                    <span className="flex items-center gap-1.5">
                      {PR_KIND_LABELS[group.headlineRecord.kind]}
                      {isRecentPersonalRecord(group.headlineRecord, now) && <NewBadge />}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums">
                        {formatValue(group.headlineRecord.value)}
                      </span>
                      {group.records.length > 1 && (
                        <span className="text-xs text-zinc-500 dark:text-zinc-500">
                          +{group.records.length - 1}
                        </span>
                      )}
                      <ChevronDown
                        className={`h-4 w-4 text-zinc-500 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      <span className="sr-only">
                        {isExpanded ? "Hide all records" : "Show all records"}
                      </span>
                    </span>
                  </button>
                  {isExpanded && (
                    <div id={detailsId} className="flex flex-col gap-1">
                      {group.standard && (
                        <p className="allow-pwa-select text-xs text-zinc-500 dark:text-zinc-500">
                          {group.standard.tier
                            ? nextTierHint(group.standard)
                            : `Beginner standard: ${group.standard.thresholds.beginner}`}
                        </p>
                      )}
                      <ul className="allow-pwa-select flex flex-col divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                        {group.records.map((record) => (
                          <li
                            key={record.id}
                            className="flex items-center justify-between gap-2 py-2"
                          >
                            <span className="flex items-center gap-1.5">
                              {PR_KIND_LABELS[record.kind]}
                              {isRecentPersonalRecord(record, now) && <NewBadge />}
                            </span>
                            <span className="flex flex-col items-end">
                              <span className="font-medium">{formatValue(record.value)}</span>
                              <span className="text-xs text-zinc-500 dark:text-zinc-500">
                                {record.achievedAt.toLocaleDateString()}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Link
                          href={`/exercises/${group.exerciseId}`}
                          className="py-1 text-sm font-medium text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
                        >
                          View 1RM chart and history
                        </Link>
                        <PostToFriendsButton
                          draft={recordPostDraft(group.name, group.headlineRecord, settings.units)}
                          className="min-h-11 rounded-lg px-2 text-sm font-medium text-zinc-600 dark:text-zinc-400"
                        />
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
            {visibleGroups.length > visibleCount && (
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                className="min-h-11 rounded-lg border border-zinc-300 text-sm font-medium dark:border-zinc-700"
              >
                Show more ({visibleGroups.length - visibleCount} left)
              </button>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
