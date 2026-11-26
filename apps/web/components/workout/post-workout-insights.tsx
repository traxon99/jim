"use client";

import { ArrowDown, ArrowUp, CalendarDays, Flame, Weight } from "@/components/icons/solar";
import { SECTION_LABEL } from "@/components/page-header";
import type { SessionRow, SettingsRow } from "@/lib/db/schema";
import { useAchievements } from "@/lib/history/use-achievements";
import { showsRestStats, showsRpe } from "@/lib/settings/features";
import { usePostWorkoutInsights } from "@/lib/workout/post-workout-insights-data";
import {
  type LiftTrend,
  MUSCLE_GROUP_LABELS,
  type MuscleGroupSets,
  type WeekComparison,
  type WorkoutTotals,
  exerciseDisplayName,
  formatRestSeconds,
  relativeChange,
} from "@jim/core";
import type { ReactNode } from "react";

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
/** Split bar tints, biggest lift first; the rest share the last one. */
const SPLIT_TINTS = ["bg-accent", "bg-accent/60", "bg-accent/35", "bg-zinc-300 dark:bg-zinc-600"];

type Better = "higher" | "lower";

/** A change chip: green when it moved the good way, orange when not, grey when flat. */
function Delta({
  change,
  label,
  better = "higher",
}: {
  /** Signed change; its sign picks the arrow. */
  change: number | null;
  label: string;
  better?: Better;
}) {
  if (change === null) return null;
  if (label === "0" || label === "0%" || change === 0) {
    return (
      <span className="inline-flex h-6 items-center rounded-full bg-zinc-900/[0.07] px-2.5 text-[13px] font-bold text-zinc-500 dark:bg-white/[0.12] dark:text-zinc-400">
        same
      </span>
    );
  }
  const good = better === "higher" ? change > 0 : change < 0;
  const Arrow = change > 0 ? ArrowUp : ArrowDown;
  return (
    <span
      className={`inline-flex h-6 items-center gap-0.5 rounded-full pr-2 pl-1.5 text-[13px] font-bold tabular-nums ${
        good ? "bg-done/15 text-done" : "bg-orange-500/15 text-orange-600 dark:text-orange-400"
      }`}
    >
      <Arrow className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
      {label}
    </span>
  );
}

function percentLabel(change: number): string {
  return `${Math.round(Math.abs(change) * 100)}%`;
}

function round(n: number, places = 0): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

function Section({
  title,
  aside,
  children,
}: { title: string; aside?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between px-1">
        <h2 className={SECTION_LABEL}>{title}</h2>
        {aside && <span className="text-[13px] text-zinc-500 tabular-nums">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function CompareRow({
  label,
  value,
  before,
  delta,
}: {
  label: string;
  value: string;
  before: string;
  delta: ReactNode;
}) {
  return (
    <li className="grid min-h-11 grid-cols-[1fr_auto_4.5rem] items-center gap-2.5 px-4">
      <span>{label}</span>
      <span className="text-right font-semibold tabular-nums">
        {value}
        <span className="ml-1.5 text-sm font-normal text-zinc-500">{before}</span>
      </span>
      <span className="justify-self-end">{delta}</span>
    </li>
  );
}

function VsLastTime({
  totals,
  previous,
  units,
  settings,
}: {
  totals: WorkoutTotals;
  previous: { startedAt: Date; totals: WorkoutTotals };
  units: string;
  settings: SettingsRow;
}) {
  const before = previous.totals;
  const max = Math.max(totals.volume, before.volume, 1);
  const minutes = Math.round(totals.durationSeconds / 60);
  const beforeMinutes = Math.round(before.durationSeconds / 60);
  const volumeChange = relativeChange(totals.volume, before.volume);
  const rows: ReactNode[] = [];

  rows.push(
    <CompareRow
      key="time"
      label="Time"
      value={`${minutes} min`}
      before={String(beforeMinutes)}
      delta={
        <Delta
          change={minutes - beforeMinutes}
          label={`${Math.abs(minutes - beforeMinutes)} min`}
          better="lower"
        />
      }
    />,
  );
  rows.push(
    <CompareRow
      key="reps"
      label="Reps"
      value={String(totals.reps)}
      before={String(before.reps)}
      delta={
        <Delta
          change={totals.reps - before.reps}
          label={String(Math.abs(totals.reps - before.reps))}
        />
      }
    />,
  );
  if (
    showsRestStats(settings) &&
    totals.averageRestSeconds != null &&
    before.averageRestSeconds != null
  ) {
    const diff = totals.averageRestSeconds - before.averageRestSeconds;
    rows.push(
      <CompareRow
        key="rest"
        label="Avg rest"
        value={formatRestSeconds(totals.averageRestSeconds)}
        before={formatRestSeconds(before.averageRestSeconds)}
        delta={<Delta change={diff} label={formatRestSeconds(Math.abs(diff))} better="lower" />}
      />,
    );
  }
  if (totals.volumePerMinute != null && before.volumePerMinute != null) {
    const change = relativeChange(totals.volumePerMinute, before.volumePerMinute);
    rows.push(
      <CompareRow
        key="density"
        label={`${units} / min`}
        value={String(Math.round(totals.volumePerMinute))}
        before={String(Math.round(before.volumePerMinute))}
        delta={change === null ? null : <Delta change={change} label={percentLabel(change)} />}
      />,
    );
  }
  if (showsRpe(settings) && totals.averageRpe != null && before.averageRpe != null) {
    const diff = round(totals.averageRpe - before.averageRpe, 1);
    rows.push(
      <CompareRow
        key="rpe"
        label="Avg RPE"
        value={String(totals.averageRpe)}
        before={String(before.averageRpe)}
        delta={<Delta change={diff} label={String(Math.abs(diff))} better="lower" />}
      />,
    );
  }

  const day = previous.startedAt.toLocaleDateString([], { month: "short", day: "numeric" });
  return (
    <>
      <div className="surface px-4 pt-4 pb-3.5">
        <div className="flex items-end justify-between">
          <div>
            <p className="mb-1 text-[13px] font-medium text-zinc-500">Volume</p>
            <p className="text-[34px] leading-none font-bold tracking-tight tabular-nums">
              {Math.round(totals.volume).toLocaleString()}
              <span className="ml-1 text-base font-semibold tracking-normal text-zinc-500">
                {units}
              </span>
            </p>
          </div>
          {volumeChange !== null && (
            <Delta change={volumeChange} label={percentLabel(volumeChange)} />
          )}
        </div>
        <div className="mt-3.5 flex flex-col gap-1.5 text-[13px] font-medium tabular-nums">
          {[
            { label: "Today", value: totals.volume, bar: "bg-accent", text: "" },
            {
              label: day,
              value: before.volume,
              bar: "bg-zinc-300 dark:bg-zinc-600",
              text: "text-zinc-500",
            },
          ].map((row) => (
            <div key={row.label} className="grid grid-cols-[3.5rem_1fr_4rem] items-center gap-2">
              <span className="text-zinc-500">{row.label}</span>
              <div className="h-2.5 overflow-hidden rounded-full bg-zinc-900/[0.05] dark:bg-white/[0.08]">
                <div
                  className={`h-full rounded-full ${row.bar}`}
                  style={{ width: `${(row.value / max) * 100}%` }}
                />
              </div>
              <span className={`text-right font-semibold ${row.text}`}>
                {Math.round(row.value).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
      <ul className="surface divide-y divide-zinc-900/10 dark:divide-white/10">{rows}</ul>
    </>
  );
}

function Sparkline({ series, up }: { series: readonly number[]; up: boolean }) {
  const w = 70;
  const h = 28;
  if (series.length < 2) return <span className="w-[70px]" />;
  const min = Math.min(...series);
  const range = Math.max(...series) - min || 1;
  const points = series.map((value, i) => [
    3 + (i * (w - 6)) / (series.length - 1),
    h - 4 - ((value - min) / range) * (h - 8),
  ]);
  const d = points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lx, ly] = points[points.length - 1];
  const color = up ? "text-done" : "text-zinc-400 dark:text-zinc-500";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`h-7 w-[70px] ${color}`} aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lx} cy={ly} r={3.2} fill="currentColor" />
    </svg>
  );
}

function LiftRow({ lift, name, units }: { lift: LiftTrend; name: string; units: string }) {
  const diff = lift.previous == null ? null : round(lift.oneRepMax - lift.previous);
  return (
    <li className="grid min-h-14 grid-cols-[1fr_70px_3.5rem] items-center gap-2.5 px-4 py-1.5">
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold">{name}</p>
        <p className="text-[13px] text-zinc-500 tabular-nums">
          <span className="font-semibold text-zinc-950 dark:text-zinc-50">
            {round(lift.oneRepMax)}
          </span>{" "}
          {units}
        </p>
      </div>
      <Sparkline series={lift.series} up={diff != null && diff > 0} />
      <span className="justify-self-end">
        {diff != null && <Delta change={diff} label={String(Math.abs(diff))} />}
      </span>
    </li>
  );
}

function hoursMinutes(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

function MuscleRow({ muscle }: { muscle: MuscleGroupSets }) {
  const done = Math.round(muscle.thisWeek);
  const last = Math.round(muscle.lastWeek);
  const cap = 15;
  const filled = Math.min(done, cap);
  const ghost = Math.max(0, Math.min(last, cap) - filled);
  return (
    <li className="grid grid-cols-[4.75rem_1fr_3.25rem] items-center gap-2 text-[13px]">
      <span className="font-medium">{MUSCLE_GROUP_LABELS[muscle.group]}</span>
      <span className="flex flex-wrap gap-[3px]" aria-hidden="true">
        {[...Array(filled).fill("d"), ...Array(ghost).fill("g")].map((kind, i) => (
          <i
            // biome-ignore lint/suspicious/noArrayIndexKey: identical dots that never reorder
            key={i}
            className={`block h-[9px] w-[9px] rounded-[3px] ${
              kind === "d"
                ? "bg-accent"
                : "shadow-[inset_0_0_0_1.5px] shadow-zinc-300 dark:shadow-zinc-600"
            }`}
          />
        ))}
      </span>
      <span className="text-right font-semibold tabular-nums">
        {round(muscle.thisWeek, 1)}
        <span className="font-normal text-zinc-500"> / {round(muscle.lastWeek, 1)}</span>
      </span>
    </li>
  );
}

function ThisWeek({
  week,
  weekStart,
  units,
}: {
  week: WeekComparison;
  weekStart: number;
  units: string;
}) {
  const max = Math.max(1, ...week.days.flatMap((day) => [day.thisWeek, day.lastWeek]));
  const change = relativeChange(week.volume, week.lastWeekToDate);
  const barHeight = (value: number) => (value > 0 ? Math.max(4, (value / max) * 64) : 3);
  return (
    <div className="surface px-4 pt-3.5 pb-3">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[13px] font-medium text-zinc-500 tabular-nums">
            {week.workouts} {week.workouts === 1 ? "workout" : "workouts"} ·{" "}
            {hoursMinutes(week.durationSeconds)}
          </p>
          <p className="text-[26px] font-bold tracking-tight tabular-nums">
            {Math.round(week.volume).toLocaleString()}
            <span className="ml-1 text-sm font-semibold tracking-normal text-zinc-500">
              {units}
            </span>
          </p>
        </div>
        {change !== null && <Delta change={change} label={percentLabel(change)} />}
      </div>
      <div className="mt-3 grid h-[88px] grid-cols-7 items-end gap-2" aria-hidden="true">
        {week.days.map((day, i) => {
          const isToday = i === week.todayIndex;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: the seven days of a week never reorder
            <div key={i} className="flex h-full flex-col items-center justify-end gap-1.5">
              <div className="flex items-end gap-[3px]">
                <i
                  className="block w-[11px] rounded-t-[4px] rounded-b-[2px] bg-zinc-900/[0.12] dark:bg-white/[0.16]"
                  style={{ height: barHeight(day.lastWeek) }}
                />
                <i
                  className={`block w-[11px] rounded-t-[4px] rounded-b-[2px] ${
                    day.thisWeek > 0
                      ? "bg-accent"
                      : i > week.todayIndex
                        ? "bg-transparent"
                        : "bg-zinc-900/[0.12] dark:bg-white/[0.16]"
                  }`}
                  style={{ height: barHeight(day.thisWeek) }}
                />
              </div>
              <span
                className={`text-[11px] font-semibold ${isToday ? "text-accent" : "text-zinc-500"}`}
              >
                {DAY_LETTERS[(weekStart + i) % 7]}
              </span>
            </div>
          );
        })}
      </div>
      {week.muscles.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2 border-t border-zinc-900/10 pt-2.5 dark:border-white/10">
          {week.muscles.map((muscle) => (
            <MuscleRow key={muscle.group} muscle={muscle} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Fact({
  icon: Icon,
  value,
  unit,
  label,
}: {
  icon: typeof Weight;
  value: string;
  unit?: string;
  label: string;
}) {
  return (
    <div className="surface min-w-0 px-4 pt-3 pb-3">
      <Icon className="h-[18px] w-[18px] text-zinc-500" strokeWidth={1.75} aria-hidden="true" />
      <p className="mt-2 text-[22px] leading-tight font-bold tracking-tight tabular-nums">
        {value}
        {unit && (
          <span className="ml-0.5 text-[13px] font-semibold tracking-normal text-zinc-500">
            {unit}
          </span>
        )}
      </p>
      <p className="truncate text-[13px] text-zinc-500">{label}</p>
    </div>
  );
}

/**
 * The post-workout Insights tab (issue #870): this workout against the
 * routine's last one, each lift's e1RM trend, this week against last week,
 * and facts about the session. Labels and numbers only (docs/PWA.md §7).
 */
export function PostWorkoutInsights({
  session,
  settings,
}: {
  session: SessionRow;
  settings: SettingsRow;
}) {
  const data = usePostWorkoutInsights(session, settings.weekStart);
  const achievements = useAchievements();
  if (!data) return null;
  const { insights, exercises } = data;
  const units = settings.units;
  const nameOf = (id: string) => {
    const exercise = exercises.get(id);
    return exercise ? exerciseDisplayName(exercise) : "Exercise";
  };
  const { heaviest, topRpe, split } = insights.facts;
  const streak = achievements?.streak.current ?? 0;
  const shownSplit = split.slice(0, 3);
  const restShare = split.slice(3).reduce((sum, part) => sum + part.share, 0);

  return (
    <div className="allow-pwa-select flex flex-col gap-5">
      {insights.previous && (
        <Section
          title={`vs last ${session.name ?? "time"}`}
          aside={insights.previous.startedAt.toLocaleDateString([], {
            month: "short",
            day: "numeric",
          })}
        >
          <VsLastTime
            totals={insights.totals}
            previous={insights.previous}
            units={units}
            settings={settings}
          />
        </Section>
      )}

      {insights.lifts.length > 0 && (
        <Section
          title="e1RM"
          aside={`Last ${Math.max(...insights.lifts.map((l) => l.series.length))}`}
        >
          <ul className="surface divide-y divide-zinc-900/10 dark:divide-white/10">
            {insights.lifts.map((lift) => (
              <LiftRow
                key={lift.exerciseId}
                lift={lift}
                name={nameOf(lift.exerciseId)}
                units={units}
              />
            ))}
          </ul>
        </Section>
      )}

      <Section title="This week" aside="vs last week">
        <ThisWeek week={insights.week} weekStart={settings.weekStart} units={units} />
      </Section>

      <Section title="This session">
        <div className="grid grid-cols-2 gap-2.5">
          {heaviest && (
            <Fact
              icon={Weight}
              value={String(round(heaviest.weight, 2))}
              unit={units}
              label={nameOf(heaviest.exerciseId)}
            />
          )}
          {topRpe && showsRpe(settings) && (
            <Fact
              icon={Flame}
              value={String(topRpe.rpe)}
              unit="RPE"
              label={`${nameOf(topRpe.exerciseId)} · set ${topRpe.setNumber}`}
            />
          )}
          {streak > 0 && (
            <Fact
              icon={CalendarDays}
              value={String(streak)}
              unit={streak === 1 ? "week" : "weeks"}
              label="Streak"
            />
          )}
          {shownSplit.length > 1 && (
            <div className="surface col-span-2 px-4 pt-3 pb-3.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[15px] font-semibold">Volume split</span>
                <span className="text-[13px] text-zinc-500 tabular-nums">
                  {Math.round(shownSplit[0].share * 100)}%
                </span>
              </div>
              <div
                className="mt-2 flex h-2.5 gap-0.5 overflow-hidden rounded-full"
                aria-hidden="true"
              >
                {shownSplit.map((part, i) => (
                  <i
                    key={part.exerciseId}
                    className={`block h-full ${SPLIT_TINTS[i]}`}
                    style={{ width: `${part.share * 100}%` }}
                  />
                ))}
                {restShare > 0 && (
                  <i
                    className={`block h-full ${SPLIT_TINTS[3]}`}
                    style={{ width: `${restShare * 100}%` }}
                  />
                )}
              </div>
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
                {shownSplit.map((part, i) => (
                  <li key={part.exerciseId} className="flex min-w-0 items-center gap-1.5">
                    <i className={`block h-2 w-2 shrink-0 rounded-[2px] ${SPLIT_TINTS[i]}`} />
                    <span className="truncate">{nameOf(part.exerciseId)}</span>
                  </li>
                ))}
                {restShare > 0 && (
                  <li className="flex items-center gap-1.5">
                    <i className={`block h-2 w-2 rounded-[2px] ${SPLIT_TINTS[3]}`} />
                    Other
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
