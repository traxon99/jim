"use client";

import {
  STAT_RANGES,
  type StatRange,
  formatCompact,
  formatMinutes,
  periodDelta,
  periodStats,
} from "@/lib/home/stats";
import {
  type PortalOverviewData,
  countGymVisits,
  revivePeriodSessions,
} from "@/lib/portal/analysis-data";
import { analysisRangeStart, summarizeTraining, weeklyVolumeTotals } from "@jim/core";
import { Star } from "lucide-react";
import { useMemo, useState } from "react";
import { PortalSectionHeader, useAnalysisRange } from "./analysis-range";
import { GymMap } from "./gym-map";
import { PortalWorkoutCard } from "./portal-workout-card";
import { useIsClient } from "./use-is-client";
import { NO_WORKOUTS_YET, usePortalTraining } from "./use-portal-training";
import { WeeklyVolumeChart } from "./weekly-volume-chart";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <span className="text-xs text-zinc-500 dark:text-zinc-500">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}

type Delta = ReturnType<typeof periodDelta>;

function ComparisonTile({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta: Delta;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <span className="text-xs text-zinc-500 dark:text-zinc-500">{label}</span>
      <span className="allow-pwa-select text-2xl font-semibold tabular-nums">{value}</span>
      {delta ? (
        <span
          className={`flex items-center gap-1 whitespace-nowrap text-xs tabular-nums ${
            delta.direction === "up"
              ? "text-emerald-600 dark:text-emerald-500"
              : "text-red-600 dark:text-red-500"
          }`}
        >
          <span aria-hidden="true" className="text-[10px]">
            {delta.direction === "up" ? "▲" : "▼"}
          </span>
          <span className="sr-only">{delta.direction === "up" ? "up" : "down"}</span>
          {delta.text}
        </span>
      ) : (
        <span className="text-xs text-zinc-400 dark:text-zinc-600">No change</span>
      )}
    </div>
  );
}

/**
 * The phone Home's stat cards (issue #470): the last 7, 30 or 90 days
 * against the same number of days before, counted by the same
 * `periodStats`. Calendar days follow the browser's time zone, so the
 * numbers wait for the client.
 */
function PeriodComparison({ data }: { data: PortalOverviewData }) {
  const isClient = useIsClient();
  const [days, setDays] = useState<StatRange>(30);
  const sessions = useMemo(() => revivePeriodSessions(data.periodSessions), [data.periodSessions]);
  const stats = useMemo(
    () => (isClient ? periodStats(sessions, days, new Date()) : null),
    [isClient, sessions, days],
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
          Last {days} days vs the {days} before
        </h2>
        <fieldset className="flex gap-1 rounded-lg border border-zinc-200 p-1 dark:border-zinc-800">
          <legend className="sr-only">Compare</legend>
          {STAT_RANGES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={days === option}
              onClick={() => setDays(option)}
              className={`min-h-9 rounded-md px-3 text-sm font-medium ${
                days === option
                  ? "bg-accent text-accent-foreground"
                  : "text-zinc-600 dark:text-zinc-400"
              }`}
            >
              {option} days
            </button>
          ))}
        </fieldset>
      </div>
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <ComparisonTile
            label="Active days"
            value={String(stats.current.activeDays)}
            delta={periodDelta(stats, "activeDays", String)}
          />
          <ComparisonTile
            label="Workouts"
            value={String(stats.current.workouts)}
            delta={periodDelta(stats, "workouts", String)}
          />
          <ComparisonTile
            label="Time"
            value={formatMinutes(stats.current.minutes)}
            delta={periodDelta(stats, "minutes", formatMinutes)}
          />
          <ComparisonTile
            label={`Volume (${data.units})`}
            value={formatCompact(stats.current.volume)}
            delta={periodDelta(stats, "volume", formatCompact)}
          />
          <ComparisonTile
            label="PRs"
            value={String(stats.current.prs)}
            delta={periodDelta(stats, "prs", String)}
          />
        </div>
      )}
    </section>
  );
}

/**
 * The Analysis Overview (issues #38, #470): headline numbers and weekly
 * training load for the chosen range, and the gym map (issue #462). All the
 * numbers come from `packages/core`, so they match the phone exactly.
 */
export function PortalOverview({ data }: { data: PortalOverviewData }) {
  const [range, setRange] = useAnalysisRange();
  const { sets, exerciseNames, workouts } = usePortalTraining(data);
  // The week a tapped bar opened (issue #468).
  const [openWeek, setOpenWeek] = useState<{ sessionIds: string[]; listHeading: string } | null>(
    null,
  );

  const analysis = useMemo(() => {
    const now = new Date();
    const since = analysisRangeStart(range, now);
    return {
      summary: summarizeTraining(sets, since, now),
      weeks: weeklyVolumeTotals(sets, data.weekStart, since, now),
      gymVisits: countGymVisits(data.gymVisits, since),
    };
  }, [sets, range, data.weekStart, data.gymVisits]);

  const gymsByVisits = useMemo(
    () =>
      [...data.gyms].sort(
        (a, b) =>
          (analysis.gymVisits.get(b.id) ?? 0) - (analysis.gymVisits.get(a.id) ?? 0) ||
          Number(b.isHome) - Number(a.isHome) ||
          a.name.localeCompare(b.name),
      ),
    [data.gyms, analysis.gymVisits],
  );

  return (
    <div className="route-fade flex flex-col gap-6">
      <PortalSectionHeader title="Overview" range={range} onRangeChange={setRange} />

      {data.sets.length === 0 ? (
        <p className="py-16 text-center text-sm text-zinc-500 dark:text-zinc-500">
          {NO_WORKOUTS_YET}
        </p>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Workouts" value={analysis.summary.workouts.toLocaleString()} />
            <StatTile label="Workouts / week" value={analysis.summary.workoutsPerWeek.toFixed(1)} />
            <StatTile label="Working sets" value={analysis.summary.sets.toLocaleString()} />
            <StatTile
              label={`Volume (${data.units})`}
              value={Math.round(analysis.summary.volume).toLocaleString()}
            />
          </section>

          <PeriodComparison data={data} />

          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
              Weekly volume
            </h2>
            <WeeklyVolumeChart
              weeks={analysis.weeks}
              units={data.units}
              onSelectWeek={(week) =>
                setOpenWeek({
                  sessionIds: week.sessionIds,
                  listHeading: `Week of ${week.weekStart.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}`,
                })
              }
            />
          </section>
        </>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
          Gyms
        </h2>
        {data.gyms.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">
            No gyms on the map yet. In Jim, open Settings, then Gyms, and pick a matching place for
            each gym&apos;s address.
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
            <GymMap gyms={data.gyms} visits={analysis.gymVisits} />
            <ul className="flex min-w-0 flex-col divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
              {gymsByVisits.map((gym) => {
                const count = analysis.gymVisits.get(gym.id) ?? 0;
                return (
                  <li key={gym.id} className="flex min-w-0 items-start justify-between gap-3 py-2">
                    <div className="flex min-w-0 flex-col">
                      <span className="flex min-w-0 items-center gap-1 font-medium">
                        <span className="truncate">{gym.name}</span>
                        {gym.isHome && (
                          <Star
                            className="h-3.5 w-3.5 shrink-0 text-accent"
                            strokeWidth={1.75}
                            fill="currentColor"
                            aria-label="Home gym"
                          />
                        )}
                      </span>
                      {gym.address && (
                        <span className="allow-pwa-select text-xs text-zinc-500 dark:text-zinc-500">
                          {gym.address}
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 tabular-nums text-zinc-600 dark:text-zinc-400">
                      {count.toLocaleString()} workout{count === 1 ? "" : "s"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
      {openWeek && (
        <PortalWorkoutCard
          {...openWeek}
          sets={sets}
          exerciseNames={exerciseNames}
          workouts={workouts}
          units={data.units}
          onClose={() => setOpenWeek(null)}
        />
      )}
    </div>
  );
}
