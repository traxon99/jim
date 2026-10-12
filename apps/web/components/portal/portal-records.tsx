"use client";

import { PrSparkline } from "@/components/history/pr-sparkline";
import { bodyweightOnDate } from "@/lib/bodyweight/series";
import { buildPrGroups, filterPrGroups, prFilterOptions } from "@/lib/history/pr-groups";
import { toTrendPoints } from "@/lib/portal/body-data";
import { type PortalRecordsData, reviveRecordEntries } from "@/lib/portal/records-data";
import { STRENGTH_TIER_LABELS } from "@/lib/strength-standards/labels";
import {
  type PersonalRecordEntry,
  type PersonalRecordSortKey,
  type PrKind,
  RECENT_PR_SECTION_DAYS,
  type StrengthStandardTier,
  isRecentPersonalRecord,
  nextTier,
  personalRecordStats,
  recentPersonalRecords,
} from "@jim/core";
import { Medal, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { PortalSectionHeader } from "./analysis-range";
import { useIsClient } from "./use-is-client";

const PR_KIND_LABELS: Record<PrKind, string> = {
  "1rm": "Estimated 1RM",
  weight: "Heaviest weight",
  volume: "Best single-set volume",
  reps_at_weight: "Most reps at a weight",
};

/** The table's columns, one per PR kind. */
const KIND_COLUMNS: { kind: PrKind; label: string }[] = [
  { kind: "1rm", label: "e1RM" },
  { kind: "weight", label: "Heaviest" },
  { kind: "volume", label: "Best set volume" },
  { kind: "reps_at_weight", label: "Most reps" },
];

const SORT_OPTIONS: { value: PersonalRecordSortKey; label: string }[] = [
  { value: "recent", label: "Most recent" },
  { value: "heaviest", label: "Heaviest" },
  { value: "name", label: "Alphabetical" },
];

const RECENT_LIMIT = 8;

const SELECT_CLASS =
  "min-h-11 min-w-0 rounded-lg border border-zinc-200 bg-white px-3 text-base text-zinc-950 md:text-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50";

/** Bronze → silver → gold → platinum for 1–4+ plates a side (issue #237). */
const PLATE_MEDAL_CLASSES = [
  "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
  "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
] as const;

function formatValue(value: number): string {
  return (Math.round(value * 100) / 100).toLocaleString();
}

function shortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function NewBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-950 dark:text-amber-300">
      <Sparkles className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
      New
    </span>
  );
}

function PlateMedal({ plates }: { plates: number }) {
  const tone = PLATE_MEDAL_CLASSES[Math.min(plates, PLATE_MEDAL_CLASSES.length) - 1];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      <Medal className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
      {plates} {plates === 1 ? "plate" : "plates"}
    </span>
  );
}

function tierHint(standard: {
  tier: StrengthStandardTier | null;
  thresholds: Record<StrengthStandardTier, number>;
}): string {
  if (!standard.tier) return `Beginner standard: ${standard.thresholds.beginner}`;
  const upcoming = nextTier(standard.tier);
  if (!upcoming) return "Elite, the top published standard";
  return `${STRENGTH_TIER_LABELS[upcoming]} standard: ${standard.thresholds[upcoming]}`;
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <span className="text-xs text-zinc-500 dark:text-zinc-500">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</span>
    </div>
  );
}

function RecordCell({ record, now }: { record: PersonalRecordEntry | undefined; now: Date }) {
  if (!record) return <span className="text-zinc-400 dark:text-zinc-600">—</span>;
  return (
    <span className="flex flex-col items-end">
      <span className="flex items-center gap-1 font-medium tabular-nums">
        {isRecentPersonalRecord(record, now) && (
          <Sparkles
            className="h-3 w-3 text-amber-600 dark:text-amber-400"
            strokeWidth={2}
            aria-label="New"
          />
        )}
        {formatValue(record.value)}
      </span>
      <span className="text-xs text-zinc-500 dark:text-zinc-500">
        {shortDate(record.achievedAt)}
      </span>
    </span>
  );
}

/**
 * The Analysis Records section (issue #470): the phone's PR page
 * (`components/history/pr-list.tsx`) laid out for desktop, every PR kind a
 * column, built by the same `buildPrGroups` so tiers, plate medals and
 * sparklines match. Dates and "New" are judged in the browser's time zone.
 */
export function PortalRecords({ data }: { data: PortalRecordsData }) {
  const isClient = useIsClient();
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState("");
  const [equipment, setEquipment] = useState("");
  const [sortKey, setSortKey] = useState<PersonalRecordSortKey>("recent");

  const now = useMemo(() => new Date(), []);
  const entries = useMemo(() => reviveRecordEntries(data.entries), [data.entries]);
  const bodyweightAt = useMemo(
    () => bodyweightOnDate(toTrendPoints(data.bodyweight)),
    [data.bodyweight],
  );
  const groups = useMemo(
    () =>
      buildPrGroups({
        entries,
        exercises: data.exercises,
        strengthProfile: data.strengthProfile,
        bodyweightAt,
        units: data.units,
        now,
      }),
    [entries, data.exercises, data.strengthProfile, bodyweightAt, data.units, now],
  );
  const stats = useMemo(() => personalRecordStats(entries, now), [entries, now]);
  const recent = useMemo(
    () => recentPersonalRecords(entries, now).slice(0, RECENT_LIMIT),
    [entries, now],
  );
  const exerciseNames = useMemo(
    () => new Map(groups.map((group) => [group.exerciseId, group.name])),
    [groups],
  );
  const prExercises = useMemo(() => {
    const withPrs = new Set(groups.map((group) => group.exerciseId));
    return data.exercises.filter((exercise) => withPrs.has(exercise.id));
  }, [groups, data.exercises]);
  const { muscleOptions, equipmentOptions } = useMemo(
    () => prFilterOptions(prExercises),
    [prExercises],
  );
  const visible = useMemo(
    () => filterPrGroups(groups, prExercises, { query, muscle, equipment, sortKey }),
    [groups, prExercises, query, muscle, equipment, sortKey],
  );
  const narrowed = query.trim() !== "" || muscle !== "" || equipment !== "";

  return (
    <div className="route-fade flex flex-col gap-6">
      <PortalSectionHeader title="Records" />
      {groups.length === 0 ? (
        <p className="py-16 text-center text-sm text-zinc-500 dark:text-zinc-500">
          No PRs yet. Log a set in Jim on your phone and your records will show up here.
        </p>
      ) : !isClient ? null : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Current PRs" value={stats.current} />
            <StatTile label="Exercises" value={stats.exercises} />
            <StatTile label="This month" value={stats.thisMonth} />
            <StatTile label="Last 7 days" value={stats.recent} />
          </div>

          {recent.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                Recent PRs · last {RECENT_PR_SECTION_DAYS} days
              </h2>
              <ul className="allow-pwa-select grid gap-x-6 divide-y divide-zinc-200 rounded-lg border border-amber-300 px-3 text-sm md:grid-cols-2 md:divide-y-0 dark:divide-zinc-800 dark:border-amber-800">
                {recent.map((record) => (
                  <li
                    key={record.id}
                    className="flex min-w-0 items-center justify-between gap-2 py-2"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">
                        {exerciseNames.get(record.exerciseId) ?? "Unknown exercise"}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-500">
                        {PR_KIND_LABELS[record.kind]}
                        {isRecentPersonalRecord(record, now) && <NewBadge />}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end">
                      <span className="font-medium tabular-nums">{formatValue(record.value)}</span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-500">
                        {shortDate(record.achievedAt)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex min-w-0 flex-1 basis-60 items-center gap-2 rounded-lg border border-zinc-200 px-3 dark:border-zinc-800">
                <Search
                  className="h-4 w-4 shrink-0 text-zinc-400"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span className="sr-only">Search exercises with PRs</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search your PRs"
                  className="min-h-11 w-full min-w-0 bg-transparent text-base outline-none"
                />
              </label>
              <select
                value={muscle}
                onChange={(event) => setMuscle(event.target.value)}
                aria-label="Muscle"
                className={`${SELECT_CLASS} flex-1 md:flex-none`}
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
                onChange={(event) => setEquipment(event.target.value)}
                aria-label="Equipment"
                className={`${SELECT_CLASS} flex-1 md:flex-none`}
              >
                <option value="">All equipment</option>
                {equipmentOptions.map((eq) => (
                  <option key={eq} value={eq}>
                    {eq}
                  </option>
                ))}
              </select>
              <select
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as PersonalRecordSortKey)}
                aria-label="Sort by"
                className={`${SELECT_CLASS} flex-1 md:flex-none`}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
              {narrowed
                ? `${visible.length.toLocaleString()} of ${groups.length.toLocaleString()} exercises`
                : `All exercises · ${groups.length.toLocaleString()}`}
            </h2>

            {visible.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-500">
                No exercises with PRs match.
              </p>
            ) : (
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-500">
                    <th className="py-2 pr-3 font-medium">Exercise</th>
                    {KIND_COLUMNS.map((column, index) => (
                      <th
                        key={column.kind}
                        className={`w-24 py-2 pr-3 text-right font-medium md:w-28 ${
                          index === 0 ? "" : "hidden lg:table-cell"
                        }`}
                      >
                        {column.label}
                      </th>
                    ))}
                    <th className="hidden w-28 py-2 font-medium md:table-cell">
                      <span className="sr-only">Progress</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="allow-pwa-select divide-y divide-zinc-200 dark:divide-zinc-800">
                  {visible.map((group) => (
                    <tr
                      key={group.exerciseId}
                      className={
                        group.hasRecent ? "bg-amber-50/60 dark:bg-amber-950/20" : undefined
                      }
                    >
                      <td className="py-2 pr-3 align-top">
                        <div className="flex min-w-0 flex-col gap-1">
                          <span className="break-words font-medium">{group.name}</span>
                          {(group.plates > 0 || group.standard) && (
                            <span className="flex flex-wrap items-center gap-1">
                              {group.plates > 0 && <PlateMedal plates={group.plates} />}
                              {group.standard && (
                                <span
                                  title={tierHint(group.standard)}
                                  className={
                                    group.standard.tier
                                      ? "rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground"
                                      : "rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                                  }
                                >
                                  {group.standard.tier
                                    ? STRENGTH_TIER_LABELS[group.standard.tier]
                                    : "Below Beginner"}
                                </span>
                              )}
                              {group.standard && (
                                <span className="hidden text-xs text-zinc-500 md:inline dark:text-zinc-500">
                                  {tierHint(group.standard)}
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </td>
                      {KIND_COLUMNS.map((column, index) => (
                        <td
                          key={column.kind}
                          className={`py-2 pr-3 text-right align-top ${
                            index === 0 ? "" : "hidden lg:table-cell"
                          }`}
                        >
                          <RecordCell
                            record={group.records.find((record) => record.kind === column.kind)}
                            now={now}
                          />
                        </td>
                      ))}
                      <td className="hidden py-2 align-top md:table-cell">
                        <PrSparkline points={group.progression} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
