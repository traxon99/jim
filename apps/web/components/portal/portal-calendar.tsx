"use client";

import { AchievementBadge } from "@/components/achievements/achievement-badge";
import { INTENSITY_LEVELS, intensityClass } from "@/components/history/training-calendar-month";
import {
  type CalendarPeriod,
  type PortalCalendarData,
  calendarPeriodBounds,
  calendarPeriods,
  heatmapColumns,
  reviveAchievements,
} from "@/lib/portal/calendar-data";
import {
  type Achievement,
  type AchievementCategory,
  buildTrainingCalendar,
  dateKey,
  trainingStreak,
} from "@jim/core";
import { Flame } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useIsClient } from "./use-is-client";

const HEADING = "text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500";

const SELECT_CLASS =
  "min-h-11 min-w-0 rounded-lg border border-zinc-200 bg-white px-3 text-base text-zinc-950 md:text-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50";

function weeks(count: number): string {
  return `${count} ${count === 1 ? "week" : "weeks"}`;
}

function StatTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <span className="text-xs text-zinc-500 dark:text-zinc-500">{label}</span>
      <span className="allow-pwa-select text-2xl font-semibold tabular-nums">{value}</span>
      {detail && <span className="text-xs text-zinc-500 dark:text-zinc-500">{detail}</span>}
    </div>
  );
}

/**
 * The Analysis Calendar section (issue #470): a year at a glance shaded by
 * each day's volume, the weekly training streak, and achievements, all
 * derived the way the phone derives them. Read-only.
 */
export function PortalCalendar({ data }: { data: PortalCalendarData }) {
  const isClient = useIsClient();
  const [period, setPeriod] = useState<CalendarPeriod>("12m");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const workouts = useMemo(
    () =>
      data.workouts.map((workout) => ({ ...workout, startedAtDate: new Date(workout.startedAt) })),
    [data.workouts],
  );
  const achievements = useMemo(() => reviveAchievements(data.achievements), [data.achievements]);

  // Days, weeks and the streak follow the browser's time zone, so all of
  // this waits for the client.
  const view = useMemo(() => {
    if (!isClient) return null;
    const today = new Date();
    const { start, end } = calendarPeriodBounds(period, today);
    const inPeriod = workouts.filter(
      (workout) =>
        workout.startedAtDate.getTime() >= start.getTime() &&
        dateKey(workout.startedAtDate) <= dateKey(end),
    );
    const days = buildTrainingCalendar(
      inPeriod.map((workout) => ({
        startedAt: workout.startedAtDate,
        totalVolume: workout.totalVolume,
      })),
    );
    return {
      todayKey: dateKey(today),
      periods: calendarPeriods(
        workouts.map((workout) => workout.startedAtDate),
        today,
      ),
      columns: heatmapColumns(start, end, data.weekStart),
      days,
      workoutCount: inPeriod.length,
      streak: trainingStreak(
        workouts.map((workout) => workout.startedAtDate),
        data.weeklyTarget,
        data.weekStart,
        today,
      ),
    };
  }, [isClient, period, workouts, data.weekStart, data.weeklyTarget]);

  const selectedWorkouts = useMemo(
    () =>
      selectedKey
        ? workouts
            .filter((workout) => dateKey(workout.startedAtDate) === selectedKey)
            .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
        : [],
    [workouts, selectedKey],
  );

  return (
    <div className="route-fade flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">Calendar</h1>
        {view && (
          <label className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-500">
            Show
            <select
              value={period}
              onChange={(event) => {
                setPeriod(event.target.value as CalendarPeriod);
                setSelectedKey(null);
              }}
              className={SELECT_CLASS}
            >
              {view.periods.map((option) => (
                <option key={option} value={option}>
                  {option === "12m" ? "Last 12 months" : option}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {data.workouts.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          No workouts finished yet. Finish one in Jim and it shows up here.
        </p>
      ) : !view ? null : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Workouts" value={view.workoutCount.toLocaleString()} />
            <StatTile label="Training days" value={view.days.size.toLocaleString()} />
            <StatTile
              label="Current streak"
              value={weeks(view.streak.current)}
              detail={`${Math.min(view.streak.thisWeek, view.streak.weeklyTarget)}/${view.streak.weeklyTarget} workouts this week`}
            />
            <StatTile label="Best streak" value={weeks(view.streak.longest)} />
          </div>

          <section className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <h2 className={HEADING}>
              {period === "12m" ? "The last 12 months" : period}, shaded by volume
            </h2>
            <YearHeatmap
              columns={view.columns}
              days={view.days}
              weekStart={data.weekStart}
              todayKey={view.todayKey}
              selectedKey={selectedKey}
              onSelect={(key) => setSelectedKey((current) => (current === key ? null : key))}
              units={data.units}
            />
            {selectedKey ? (
              <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-900">
                <h3 className="text-sm font-semibold">
                  {selectedWorkouts[0]?.startedAtDate.toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </h3>
                <ul className="flex flex-col gap-1">
                  {selectedWorkouts.map((workout) => (
                    <li key={workout.id}>
                      <Link
                        href={`/portal/workouts/${workout.id}`}
                        className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 rounded-md px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                      >
                        <span className="min-w-0 truncate text-sm font-medium">{workout.name}</span>
                        <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-500">
                          {workout.setCount} sets ·{" "}
                          {Math.round(workout.totalVolume).toLocaleString()} {data.units}
                          {workout.prCount > 0 &&
                            ` · ${workout.prCount} PR${workout.prCount === 1 ? "" : "s"}`}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-zinc-500 dark:text-zinc-500">
                Pick a shaded day to see its workouts.
              </p>
            )}
          </section>

          <PortalAchievements achievements={achievements} streakCurrent={view.streak.current} />
        </>
      )}
    </div>
  );
}

const CELL = "h-3.5 w-3.5 rounded-[3px]";

/**
 * Weeks across, weekdays down, like a contribution graph. Only days with
 * a workout are buttons, so the keyboard steps through training days
 * rather than all 365. Scrolls inside its own box below desktop width.
 */
function YearHeatmap({
  columns,
  days,
  weekStart,
  todayKey,
  selectedKey,
  onSelect,
  units,
}: {
  columns: ReturnType<typeof heatmapColumns>;
  days: ReturnType<typeof buildTrainingCalendar>;
  weekStart: number;
  todayKey: string;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  units: string;
}) {
  const maxVolume = Math.max(0, ...[...days.values()].map((day) => day.totalVolume));
  const weekdayLabels = useMemo(() => {
    const reference = new Date(2024, 0, 7 + weekStart); // a Sunday, offset to weekStart
    return Array.from({ length: 7 }, (_, i) =>
      new Date(2024, 0, reference.getDate() + i).toLocaleDateString(undefined, {
        weekday: "short",
      }),
    );
  }, [weekStart]);

  // Start a narrow screen on the latest weeks, where the scroll would end.
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastColumn = columns[columns.length - 1]?.weekStart.getTime();
  useEffect(() => {
    if (lastColumn != null && scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [lastColumn]);

  return (
    <div className="flex flex-col gap-2">
      <div ref={scrollRef} className="overflow-x-auto pb-1">
        <div className="flex w-max gap-[3px]">
          <div className="flex flex-col gap-[3px] pr-1" aria-hidden="true">
            <span className="h-4" />
            <span className="h-1" />
            {weekdayLabels.map((label, index) => (
              <span
                key={label}
                className="h-3.5 text-[10px] leading-3.5 text-zinc-500 dark:text-zinc-500"
              >
                {index % 2 === 1 ? label : ""}
              </span>
            ))}
          </div>
          {columns.map((column) => (
            <div key={column.weekStart.toISOString()} className="flex flex-col gap-[3px]">
              <span className="relative h-4 w-3.5 text-[10px] text-zinc-500 dark:text-zinc-500">
                {column.monthLabel && (
                  <span className="absolute left-0 whitespace-nowrap">{column.monthLabel}</span>
                )}
              </span>
              <span className="h-1" aria-hidden="true" />
              {column.days.map(({ date, inPeriod }) => {
                const key = dateKey(date);
                if (!inPeriod) {
                  return <span key={key} className={CELL} aria-hidden="true" />;
                }
                const day = days.get(key);
                const ring =
                  key === selectedKey
                    ? "ring-2 ring-accent"
                    : key === todayKey
                      ? "ring-1 ring-zinc-400 dark:ring-zinc-500"
                      : "";
                if (!day) {
                  return (
                    <span
                      key={key}
                      title={date.toLocaleDateString()}
                      className={`${CELL} bg-zinc-100 dark:bg-zinc-900 ${ring}`}
                    />
                  );
                }
                const label = `${date.toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}: ${day.sessionCount} workout${day.sessionCount === 1 ? "" : "s"}, ${Math.round(
                  day.totalVolume,
                ).toLocaleString()} ${units}`;
                return (
                  <button
                    key={key}
                    type="button"
                    title={label}
                    aria-label={label}
                    aria-pressed={key === selectedKey}
                    onClick={() => onSelect(key)}
                    className={`${CELL} ${
                      intensityClass(day.totalVolume, maxVolume) || INTENSITY_LEVELS[0]
                    } ${ring}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-end gap-1 text-[11px] text-zinc-500 dark:text-zinc-500">
        <span className="mr-0.5">Less volume</span>
        {INTENSITY_LEVELS.map((level) => (
          <span key={level} aria-hidden="true" className={`h-3 w-3 rounded-sm ${level}`} />
        ))}
        <span className="ml-0.5">More</span>
      </div>
    </div>
  );
}

/** Earned badges, newest first, and the next milestone in each track, as on Profile. */
function PortalAchievements({
  achievements,
  streakCurrent,
}: {
  achievements: readonly Achievement[];
  streakCurrent: number;
}) {
  const { earned, upNext } = useMemo(() => {
    const earnedList = achievements
      .filter((achievement) => achievement.achievedAt)
      .sort((a, b) => (b.achievedAt?.getTime() ?? 0) - (a.achievedAt?.getTime() ?? 0));
    const seen = new Set<AchievementCategory>();
    const next: Achievement[] = [];
    for (const achievement of achievements) {
      if (achievement.achievedAt || seen.has(achievement.category)) continue;
      seen.add(achievement.category);
      next.push(achievement);
    }
    return { earned: earnedList, upNext: next };
  }, [achievements]);

  if (achievements.length === 0) return null;

  return (
    <section className="grid gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex min-w-0 flex-col gap-3">
        <h2 className={`${HEADING} flex items-center gap-1.5`}>
          Achievements · {earned.length} earned
          {streakCurrent > 0 && (
            <Flame className="h-3.5 w-3.5 text-orange-500" strokeWidth={2} aria-hidden="true" />
          )}
        </h2>
        {earned.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">None earned yet.</p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
            {earned.map((achievement) => {
              const content = (
                <>
                  <AchievementBadge achievement={achievement} />
                  <span className="text-sm font-medium leading-tight">{achievement.title}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-500">
                    {achievement.achievedAt?.toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </>
              );
              const className =
                "flex h-full flex-col items-center gap-1 rounded-lg border border-zinc-200 p-3 text-center dark:border-zinc-800";
              return (
                <li key={achievement.id}>
                  {achievement.sessionId ? (
                    <Link
                      href={`/portal/workouts/${achievement.sessionId}`}
                      title="Open the workout it was earned in"
                      className={`${className} hover:bg-zinc-50 dark:hover:bg-zinc-900`}
                    >
                      {content}
                    </Link>
                  ) : (
                    <div className={className}>{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {upNext.length > 0 && (
        <div className="flex min-w-0 flex-col gap-3">
          <h2 className={HEADING}>Up next</h2>
          <ul className="flex flex-col gap-3">
            {upNext.map((achievement) => (
              <li key={achievement.id} className="flex items-center gap-3">
                <AchievementBadge achievement={achievement} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm font-medium">{achievement.title}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-500">
                    {achievement.description}
                  </span>
                  {achievement.progress && (
                    <div className="flex items-center gap-2">
                      <div
                        className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
                        aria-hidden="true"
                      >
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{
                            width: `${Math.min(100, (achievement.progress.current / achievement.progress.target) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="shrink-0 text-[11px] tabular-nums text-zinc-500 dark:text-zinc-500">
                        {Math.round(achievement.progress.current).toLocaleString()}/
                        {achievement.progress.target.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
