"use client";

import { db } from "@/lib/db/schema";
import { buildSessionListEntries } from "@/lib/history/session-list-entries";
import { useAchievements } from "@/lib/history/use-achievements";
import {
  type PeriodTotals,
  STAT_RANGES,
  type StatRange,
  formatCompact,
  formatMinutes,
  periodStats,
  weekActivity,
} from "@/lib/home/stats";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { useLiveQuery } from "dexie-react-hooks";
import {
  BarChart3,
  Check,
  ClipboardList,
  Dumbbell,
  type LucideIcon,
  TrendingUp,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: "narrow" });
const WEEKDAY_LONG = new Intl.DateTimeFormat(undefined, { weekday: "long" });

const SHORTCUTS: readonly { href: string; label: string; Icon: LucideIcon }[] = [
  { href: "/workout", label: "Train", Icon: Dumbbell },
  { href: "/routines", label: "Routines", Icon: ClipboardList },
  { href: "/history/prs", label: "PRs", Icon: Trophy },
  { href: "/history/volume", label: "Volume", Icon: BarChart3 },
  { href: "/progression", label: "Progression", Icon: TrendingUp },
];

/**
 * The top of Home: a mini profile of your own training before the friends
 * feed. A greeting with your streak, this week's workout days, stat cards
 * for the last 7/30/90 days against the period before. All of it reads
 * local history, so it works offline.
 */
export function HomeSummary({ username }: { username: string | null }) {
  const settings = useLiveQuery(() => db.settings.get("me"), []) ?? DEFAULT_SETTINGS;
  const achievements = useAchievements();
  const [range, setRange] = useState<StatRange>(7);

  const entries = useLiveQuery(async () => {
    const [sessions, sessionExercises, exercises, sets, personalRecords] = await Promise.all([
      db.sessions.toArray(),
      db.sessionExercises.toArray(),
      db.exercises.toArray(),
      db.sets.toArray(),
      db.personalRecords.toArray(),
    ]);
    return buildSessionListEntries(sessions, sessionExercises, exercises, sets, personalRecords);
  }, []);

  const days = useMemo(
    () =>
      weekActivity(
        (entries ?? []).map((entry) => entry.startedAt),
        settings.weekStart,
        new Date(),
      ),
    [entries, settings.weekStart],
  );
  const stats = useMemo(() => periodStats(entries ?? [], range, new Date()), [entries, range]);

  const streak = achievements?.streak;
  const headline = !streak
    ? " "
    : streak.current > 0
      ? `You have a ${streak.current}-week streak going.`
      : "Train this week to start a streak.";

  return (
    <section className="flex w-full flex-col text-left">
      <div className="flex items-center gap-4 px-4 pt-2">
        <Link
          href="/profile"
          aria-label="Profile"
          data-ripple
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent text-2xl font-bold uppercase text-accent-foreground"
        >
          {username ? username.charAt(0) : ""}
        </Link>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="allow-pwa-select truncate text-sm text-zinc-500 dark:text-zinc-500">
            Welcome back{username ? `, @${username}` : ""}
          </p>
          <p className="text-xl font-semibold leading-tight tracking-tight">{headline}</p>
        </div>
      </div>

      <ol className="flex justify-between gap-1 pt-4 pr-4 pl-24" aria-label="This week">
        {days.map((day) => (
          <li
            key={day.date.getTime()}
            className="flex flex-1 flex-col items-center gap-1"
            aria-label={`${WEEKDAY_LONG.format(day.date)}${day.trained ? ", trained" : ""}${
              day.isToday ? ", today" : ""
            }`}
          >
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full ${
                day.trained
                  ? "bg-accent text-accent-foreground"
                  : day.isToday || day.isFuture
                    ? "border-2 border-zinc-200 dark:border-zinc-800"
                    : "bg-zinc-200 dark:bg-zinc-800"
              }`}
            >
              {day.trained && <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />}
            </span>
            <span
              aria-hidden="true"
              className={`text-xs ${
                day.isToday
                  ? "font-semibold text-zinc-950 dark:text-zinc-50"
                  : "text-zinc-400 dark:text-zinc-600"
              }`}
            >
              {WEEKDAY.format(day.date)}
            </span>
          </li>
        ))}
      </ol>

      <div
        role="tablist"
        aria-label="Stats range"
        className="mt-5 flex gap-6 border-b border-zinc-200 px-4 dark:border-zinc-800"
      >
        {STAT_RANGES.map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={range === option}
            onClick={() => setRange(option)}
            className={`-mb-px min-h-11 border-b-2 text-base ${
              range === option
                ? "border-accent font-semibold text-zinc-950 dark:text-zinc-50"
                : "border-transparent text-zinc-500 dark:text-zinc-500"
            }`}
          >
            {option} Day
          </button>
        ))}
      </div>

      {/* min-w-0 + overflow-x-auto: the cards scroll within the row instead of widening the page (issue #182). */}
      <div className="flex min-w-0 gap-2 overflow-x-auto px-4 pt-3 pb-5" key={range}>
        <StatCard
          label="Active days"
          value={String(stats.current.activeDays)}
          delta={delta(stats, "activeDays", String)}
        />
        <StatCard
          label="Workouts"
          value={String(stats.current.workouts)}
          delta={delta(stats, "workouts", String)}
        />
        <StatCard
          label="Time"
          value={formatMinutes(stats.current.minutes)}
          delta={delta(stats, "minutes", formatMinutes)}
        />
        <StatCard
          label="Volume"
          value={formatCompact(stats.current.volume)}
          unit={settings.units}
          delta={delta(stats, "volume", formatCompact)}
        />
        <StatCard
          label="PRs"
          value={String(stats.current.prs)}
          delta={delta(stats, "prs", String)}
        />
      </div>
    </section>
  );
}

/** Shortcuts into the rest of the app, as a row of cards that scrolls sideways. */
export function HomeShortcuts() {
  return (
    <nav aria-label="Shortcuts" className="flex min-w-0 gap-2 overflow-x-auto px-4">
      {SHORTCUTS.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          data-ripple
          className="flex min-h-14 shrink-0 items-center gap-2.5 rounded-lg border border-zinc-200 bg-white px-4 text-base font-semibold dark:border-zinc-800 dark:bg-zinc-950"
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

function delta(
  stats: { current: PeriodTotals; previous: PeriodTotals },
  key: keyof PeriodTotals,
  format: (value: number) => string,
): { direction: "up" | "down"; text: string } | null {
  const change = stats.current[key] - stats.previous[key];
  if (Math.round(change) === 0) return null;
  return { direction: change > 0 ? "up" : "down", text: format(Math.abs(change)) };
}

function StatCard({
  label,
  value,
  unit,
  delta,
}: {
  label: string;
  value: string;
  unit?: string;
  delta: { direction: "up" | "down"; text: string } | null;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-1 rounded-lg bg-zinc-100 px-3 py-2.5 dark:bg-zinc-900">
      <span className="text-sm text-zinc-500 dark:text-zinc-500">{label}</span>
      <span className="allow-pwa-select flex items-baseline gap-2 whitespace-nowrap">
        <span className="text-3xl font-semibold tabular-nums tracking-tight">
          {value}
          {unit && <span className="ml-0.5 text-base font-medium">{unit}</span>}
        </span>
        {delta && (
          <span
            className={`flex items-center gap-1 text-sm tabular-nums ${
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
        )}
      </span>
    </div>
  );
}
