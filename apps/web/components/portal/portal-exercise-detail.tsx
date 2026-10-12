"use client";

import { BodyMap, muscleSummary } from "@/components/exercises/body-map";
import { OneRepMaxChart } from "@/components/history/one-rep-max-chart";
import { RestStatsLine, SetRestTag } from "@/components/workout/rest-stats-line";
import type { PortalExerciseDetail } from "@/lib/portal/exercises-data";
import { reviveRecordEntries } from "@/lib/portal/records-data";
import { setKindLabel, setNumberLabels } from "@/lib/sessions/set-kinds";
import {
  PULLEY_LABELS,
  type PrKind,
  computeCardioBests,
  currentPersonalRecords,
  distanceUnitFor,
  estimatedOneRepMaxSeries,
  exerciseDemo,
  exerciseMuscleShading,
  formatDistance,
  formatDuration,
  formatTimedSet,
  isRecentPersonalRecord,
  machineName,
  warmupFrequency,
} from "@jim/core";
import { ChevronLeft, ExternalLink, MapPin, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useIsClient } from "./use-is-client";

/** Workouts listed under "Set history" before "Show more". */
const HISTORY_PAGE = 10;

const PR_COLUMNS: { kind: PrKind; label: string }[] = [
  { kind: "1rm", label: "Estimated 1RM" },
  { kind: "weight", label: "Heaviest weight" },
  { kind: "volume", label: "Best set volume" },
  { kind: "reps_at_weight", label: "Most reps" },
];

function Stat({
  label,
  value,
  detail,
  small = false,
}: {
  label: string;
  value: string;
  detail?: string;
  /** For a value as long as a date, so it fits a quarter-width tile. */
  small?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <dt className="text-xs text-zinc-500 dark:text-zinc-500">{label}</dt>
      <dd className={`${small ? "text-base" : "text-xl"} font-semibold break-words tabular-nums`}>
        {value}
      </dd>
      {detail && <dd className="text-xs text-zinc-500 dark:text-zinc-500">{detail}</dd>}
    </div>
  );
}

function shortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function SectionHeading({ children }: { children: string }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
      {children}
    </h2>
  );
}

/**
 * One exercise on desktop (issue #470), read-only: the phone's exercise page
 * (`components/exercises/exercise-detail.tsx`) with room to spread out. Its
 * records, e1RM over all time (points open their workout), how often it's
 * done, muscles worked, machine, instructions and every set ever logged.
 */
export function PortalExerciseDetailView({
  detail,
  units,
}: {
  detail: PortalExerciseDetail;
  units: "lb" | "kg";
}) {
  const router = useRouter();
  const isClient = useIsClient();
  const [historyCount, setHistoryCount] = useState(HISTORY_PAGE);
  const { exercise } = detail;
  const distanceUnit = distanceUnitFor(units);
  const isWarmup = exercise.category === "warmup";
  const isCardio = exercise.category === "cardio";

  const sets = useMemo(
    () => detail.sets.map((set) => ({ ...set, completedAt: new Date(set.completedAt) })),
    [detail.sets],
  );
  const now = useMemo(() => new Date(), []);
  const records = useMemo(
    () => currentPersonalRecords(reviveRecordEntries(detail.records)),
    [detail.records],
  );
  const oneRepMaxPoints = useMemo(() => estimatedOneRepMaxSeries(sets), [sets]);
  const frequency = useMemo(() => warmupFrequency(sets, now), [sets, now]);
  const cardioBests = useMemo(() => computeCardioBests(sets), [sets]);
  const workingSets = sets.filter((set) => set.kind !== "warmup").length;

  // Newest workout first, sets in the order they were done.
  const history = useMemo(() => {
    const groups = new Map<string, typeof sets>();
    for (const set of sets) {
      const list = groups.get(set.sessionId) ?? [];
      list.push(set);
      groups.set(set.sessionId, list);
    }
    return [...groups.entries()]
      .map(([sessionId, groupSets]) => ({
        sessionId,
        date: groupSets[0]?.completedAt,
        sets: groupSets,
      }))
      .reverse();
  }, [sets]);
  const firstDone = sets[0]?.completedAt;

  const demo = exerciseDemo({ name: exercise.name, videoUrl: exercise.videoUrl });
  const machine = machineName(exercise);
  const pulley = exercise.pulleyType ? PULLEY_LABELS[exercise.pulleyType] : null;
  const hasMuscles = exercise.primaryMuscles.length + exercise.secondaryMuscles.length > 0;
  const tags = [
    isWarmup ? "warm-up" : null,
    isCardio ? "cardio" : null,
    exercise.equipment,
    ...exercise.primaryMuscles,
    ...exercise.secondaryMuscles,
  ].filter((tag): tag is string => Boolean(tag));

  return (
    <div className="route-fade flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/portal/exercises"
          className="flex items-center gap-1 self-start text-sm font-medium text-zinc-500 dark:text-zinc-500"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Exercises
        </Link>
        <h1 className="text-2xl font-semibold break-words">{exercise.name}</h1>
        {exercise.isArchived && (
          <p className="text-xs text-amber-600 dark:text-amber-500">Archived</p>
        )}
        {tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        <div className="flex min-w-0 flex-col gap-6">
          {isClient && (
            <section className="flex flex-col gap-2">
              <SectionHeading>How often</SectionHeading>
              <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Workouts" value={frequency.sessionCount.toLocaleString()} />
                <Stat label="Last 30 days" value={frequency.recentSessionCount.toLocaleString()} />
                <Stat
                  label={isWarmup || isCardio ? "Sets" : "Working sets"}
                  value={(isWarmup ? sets.length : workingSets).toLocaleString()}
                />
                <Stat
                  label="Last done"
                  small
                  value={frequency.lastDoneAt ? shortDate(frequency.lastDoneAt) : "—"}
                  detail={firstDone ? `First ${shortDate(firstDone)}` : undefined}
                />
              </dl>
            </section>
          )}

          {!isWarmup && !isCardio && records.length > 0 && isClient && (
            <section className="flex flex-col gap-2">
              <SectionHeading>{`Records (${units})`}</SectionHeading>
              <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {PR_COLUMNS.map((column) => {
                  const record = records.find((r) => r.kind === column.kind);
                  if (!record) return null;
                  return (
                    <div
                      key={column.kind}
                      className="flex min-w-0 flex-col gap-1 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
                    >
                      <dt className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-500">
                        {column.label}
                        {isRecentPersonalRecord(record, now) && (
                          <Sparkles
                            className="h-3 w-3 text-amber-600 dark:text-amber-400"
                            strokeWidth={2}
                            aria-label="New"
                          />
                        )}
                      </dt>
                      <dd className="text-xl font-semibold tabular-nums">
                        {(Math.round(record.value * 100) / 100).toLocaleString()}
                      </dd>
                      <dd className="text-xs text-zinc-500 dark:text-zinc-500">
                        {shortDate(record.achievedAt)}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          )}

          {isCardio &&
            (cardioBests.distance != null ||
              cardioBests.durationSeconds != null ||
              cardioBests.paceSeconds != null) && (
              <section className="flex flex-col gap-2">
                <SectionHeading>Records</SectionHeading>
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Stat
                    label="Longest distance"
                    value={
                      cardioBests.distance != null
                        ? formatDistance(cardioBests.distance, distanceUnit)
                        : "—"
                    }
                  />
                  <Stat
                    label="Longest time"
                    value={
                      cardioBests.durationSeconds != null
                        ? formatDuration(cardioBests.durationSeconds)
                        : "—"
                    }
                  />
                  <Stat
                    label="Fastest pace"
                    value={
                      cardioBests.paceSeconds != null
                        ? `${formatDuration(cardioBests.paceSeconds)} /${distanceUnit}`
                        : "—"
                    }
                  />
                </dl>
              </section>
            )}

          {!isWarmup && !isCardio && oneRepMaxPoints.length > 0 && isClient && (
            <section className="flex flex-col gap-2">
              <SectionHeading>{`Estimated 1RM over time (${units})`}</SectionHeading>
              <OneRepMaxChart
                points={oneRepMaxPoints}
                units={units}
                onSelectPoint={(point) => router.push(`/portal/workouts/${point.sessionId}`)}
              />
            </section>
          )}

          <section className="flex flex-col gap-2">
            <SectionHeading>Set history</SectionHeading>
            {!isWarmup && <RestStatsLine sets={sets} />}
            {history.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-500">No sets logged yet.</p>
            ) : (
              <div className="allow-pwa-select flex flex-col gap-4 text-sm">
                {history.slice(0, historyCount).map((group) => {
                  const labels = setNumberLabels(group.sets.map((set) => set.kind));
                  return (
                    <section key={group.sessionId} className="flex flex-col">
                      <Link
                        href={`/portal/workouts/${group.sessionId}`}
                        className="self-start text-xs font-medium text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-500"
                      >
                        {isClient && group.date
                          ? group.date.toLocaleDateString(undefined, {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : "Workout"}
                      </Link>
                      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                        {group.sets.map((set, index) => (
                          <li
                            key={set.id}
                            className="flex min-w-0 flex-wrap items-center gap-2 py-2"
                          >
                            {set.kind === "warmup" ? (
                              <span
                                aria-label="Warm-up set"
                                className="w-6 font-bold text-amber-500 dark:text-amber-400"
                              >
                                W
                              </span>
                            ) : (
                              <span className="w-6 text-zinc-500 dark:text-zinc-500">
                                #{labels[index]}
                              </span>
                            )}
                            <span className="tabular-nums">
                              {set.weight != null && set.reps != null
                                ? `${set.weight.toLocaleString()} ${units} × ${set.reps}`
                                : set.reps != null
                                  ? `${set.reps} reps`
                                  : (formatTimedSet(set, distanceUnit) ?? "—")}
                            </span>
                            {set.rpe != null && (
                              <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-500">
                                RPE {set.rpe}
                              </span>
                            )}
                            {set.kind !== "working" && set.kind !== "warmup" && (
                              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                                {setKindLabel(set.kind)}
                              </span>
                            )}
                            <SetRestTag set={set} />
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
                {history.length > historyCount && (
                  <button
                    type="button"
                    onClick={() => setHistoryCount((count) => count + HISTORY_PAGE)}
                    className="min-h-11 rounded-lg border border-zinc-200 text-sm font-medium md:self-start md:px-6 dark:border-zinc-800"
                  >
                    Show more ({history.length - historyCount} more workouts)
                  </button>
                )}
              </div>
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
          {hasMuscles && (
            <section className="flex flex-col gap-2">
              <SectionHeading>Muscles worked</SectionHeading>
              <BodyMap
                shading={exerciseMuscleShading(exercise)}
                label={muscleSummary(exercise.primaryMuscles, exercise.secondaryMuscles)}
                className="max-w-xs"
              />
              {exercise.secondaryMuscles.length > 0 && (
                <p className="text-xs text-zinc-500 dark:text-zinc-500">
                  Darker: primary · lighter: secondary
                </p>
              )}
            </section>
          )}

          {(machine || pulley || detail.gymName) && (
            <section className="flex flex-col gap-1">
              <SectionHeading>Machine</SectionHeading>
              {(machine || pulley) && (
                <p className="allow-pwa-select text-sm text-zinc-700 dark:text-zinc-300">
                  {[machine, pulley].filter(Boolean).join(" · ")}
                </p>
              )}
              {detail.gymName && (
                <p className="flex min-w-0 items-center gap-1 text-sm text-zinc-600 dark:text-zinc-400">
                  <MapPin className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                  <span className="truncate">At {detail.gymName}</span>
                </p>
              )}
            </section>
          )}

          <a
            href={demo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-200 px-4 text-sm font-medium dark:border-zinc-800"
          >
            <ExternalLink className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            {demo.custom ? "Watch demo video" : "Find a demo video"}
          </a>

          {exercise.imageUrls.length > 0 && (
            <div className="flex gap-2 overflow-x-auto">
              {exercise.imageUrls.map((url) => (
                <img
                  key={url}
                  src={url}
                  alt={exercise.name}
                  className="h-40 w-auto rounded-lg object-cover"
                />
              ))}
            </div>
          )}

          {exercise.instructions.length > 0 && (
            <section className="flex flex-col gap-1">
              <SectionHeading>Instructions</SectionHeading>
              <ol className="allow-pwa-select list-decimal space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
                {exercise.instructions.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
