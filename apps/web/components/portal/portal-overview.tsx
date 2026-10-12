"use client";

import { type PortalOverviewData, countGymVisits } from "@/lib/portal/analysis-data";
import { analysisRangeStart, summarizeTraining, weeklyVolumeTotals } from "@jim/core";
import { Star } from "lucide-react";
import { useMemo, useState } from "react";
import { PortalSectionHeader, useAnalysisRange } from "./analysis-range";
import { GymMap } from "./gym-map";
import { PortalWorkoutCard } from "./portal-workout-card";
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
