"use client";

import { Highlight } from "@/components/highlight";
import { formatMinutes } from "@/lib/home/stats";
import { type PortalWorkoutRow, workoutMatchesSearch } from "@/lib/portal/workouts-data";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PortalSectionHeader } from "./analysis-range";
import { useIsClient } from "./use-is-client";
import { NO_WORKOUTS_YET } from "./use-portal-training";

const PAGE_SIZE = 25;

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

/**
 * The Analysis Workouts section (issue #470): every finished workout in a
 * searchable, paged table, each opening its full page. The numbers match the
 * phone's History list (`buildSessionListEntries`).
 */
export function PortalWorkouts({
  workouts,
  units,
}: {
  workouts: readonly PortalWorkoutRow[];
  units: string;
}) {
  const isClient = useIsClient();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const matches = useMemo(
    () => workouts.filter((workout) => workoutMatchesSearch(workout, query)),
    [workouts, query],
  );
  const pageCount = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const shown = matches.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  return (
    <div className="route-fade flex flex-col gap-6">
      <PortalSectionHeader title="Workouts" />
      {workouts.length === 0 ? (
        <p className="py-16 text-center text-sm text-zinc-500 dark:text-zinc-500">
          {NO_WORKOUTS_YET}
        </p>
      ) : (
        <>
          <label className="flex min-w-0 items-center gap-2 rounded-lg border border-zinc-200 px-3 md:max-w-sm dark:border-zinc-800">
            <Search
              className="h-4 w-4 shrink-0 text-zinc-400"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span className="sr-only">Search workouts</span>
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              placeholder="Search by name, gym or exercise"
              // 16px so iOS doesn't zoom in on focus (docs/PWA.md §6).
              className="min-h-11 w-full min-w-0 bg-transparent text-base outline-none"
            />
          </label>

          {matches.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-500">No workouts match.</p>
          ) : (
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-500">
                  <th className="w-32 py-2 pr-3 font-medium md:w-40">Date</th>
                  <th className="py-2 pr-3 font-medium">Workout</th>
                  <th className="hidden py-2 pr-3 font-medium lg:table-cell">Gym</th>
                  <th className="hidden w-20 py-2 pr-3 text-right font-medium md:table-cell">
                    Duration
                  </th>
                  <th className="hidden w-14 py-2 pr-3 text-right font-medium md:table-cell">
                    Sets
                  </th>
                  <th className="w-24 py-2 pr-3 text-right font-medium">Volume ({units})</th>
                  <th className="hidden w-12 py-2 text-right font-medium sm:table-cell">PRs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {shown.map((workout) => (
                  <tr key={workout.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                    <td className="py-2 pr-3 tabular-nums text-zinc-600 dark:text-zinc-400">
                      {isClient ? DATE_FORMAT.format(new Date(workout.startedAt)) : ""}
                    </td>
                    <td className="py-2 pr-3">
                      <Link
                        href={`/portal/workouts/${workout.id}`}
                        className="block truncate font-medium underline-offset-4 hover:underline"
                      >
                        <Highlight text={workout.name} query={query} />
                      </Link>
                    </td>
                    <td className="hidden truncate py-2 pr-3 text-zinc-600 lg:table-cell dark:text-zinc-400">
                      {workout.gymName ? <Highlight text={workout.gymName} query={query} /> : "—"}
                    </td>
                    <td className="hidden py-2 pr-3 text-right tabular-nums md:table-cell">
                      {formatMinutes(workout.durationSeconds / 60)}
                    </td>
                    <td className="hidden py-2 pr-3 text-right tabular-nums md:table-cell">
                      {workout.setCount}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {Math.round(workout.totalVolume).toLocaleString()}
                    </td>
                    <td className="hidden py-2 text-right tabular-nums sm:table-cell">
                      {workout.prCount > 0 ? workout.prCount : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {pageCount > 1 && (
            <nav
              aria-label="Pages"
              className="flex items-center justify-between gap-3 text-sm text-zinc-600 dark:text-zinc-400"
            >
              <button
                type="button"
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage === 0}
                className="flex min-h-11 items-center gap-1 rounded-lg px-3 font-medium disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Newer
              </button>
              <span className="tabular-nums">
                Page {currentPage + 1} of {pageCount} · {matches.length.toLocaleString()} workouts
              </span>
              <button
                type="button"
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= pageCount - 1}
                className="flex min-h-11 items-center gap-1 rounded-lg px-3 font-medium disabled:opacity-40"
              >
                Older
                <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
