"use client";

import { db } from "@/lib/db/schema";
import { useSessionList } from "@/lib/history/use-session-list";
import {
  STAT_RANGES,
  type StatRange,
  formatCompact,
  formatMinutes,
  periodDelta,
  periodStats,
} from "@/lib/home/stats";
import { useToday } from "@/lib/pwa/use-today";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";

/**
 * Your training over the last 7, 30 or 90 days against the period before:
 * five stat cards. It used to open Home; Home is now friends first, like the
 * social mockups (#746), so it opens History instead. Reads local history,
 * so it works offline.
 */
export function TrainingStats() {
  const settings = useLiveQuery(() => db.settings.get("me"), []) ?? DEFAULT_SETTINGS;
  const [range, setRange] = useState<StatRange>(7);
  const entries = useSessionList()?.entries;
  // Not a bare new Date(): the app can resume days later with this still mounted (#523).
  const today = useToday();
  const stats = useMemo(() => periodStats(entries ?? [], range, today), [entries, range, today]);

  return (
    <section aria-label="Your stats" className="flex flex-col">
      <div
        role="tablist"
        aria-label="Stats range"
        className="flex gap-6 border-b border-zinc-200 dark:border-zinc-800"
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

      {/* All five cards fit on screen as a 3-column grid (issue #327): a row
          that scrolled sideways clipped the fourth card mid-word. */}
      <div className="grid grid-cols-3 gap-2 pt-3" key={range}>
        <StatCard
          label="Active days"
          value={String(stats.current.activeDays)}
          delta={periodDelta(stats, "activeDays", String)}
        />
        <StatCard
          label="Workouts"
          value={String(stats.current.workouts)}
          delta={periodDelta(stats, "workouts", String)}
        />
        <StatCard
          label="Time"
          value={formatMinutes(stats.current.minutes)}
          delta={periodDelta(stats, "minutes", formatMinutes)}
        />
        <StatCard
          label="Volume"
          value={formatCompact(stats.current.volume)}
          unit={settings.units}
          delta={periodDelta(stats, "volume", formatCompact)}
        />
        <StatCard
          label="PRs"
          value={String(stats.current.prs)}
          delta={periodDelta(stats, "prs", String)}
        />
      </div>
    </section>
  );
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
    // Sized so the longest values ("12h 30m", "123.4k lb") fit a third of
    // the row at 393px (issue #327); the change sits on its own line below.
    // Outlined on the white band in light mode rather than filled grey, which
    // blended into the grey section below and cut the band off mid-tile
    // (issue #333).
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-2.5 dark:border-transparent dark:bg-zinc-900">
      <span className="text-sm text-zinc-500 dark:text-zinc-500">{label}</span>
      <span className="allow-pwa-select flex flex-col">
        <span className="text-xl font-semibold tabular-nums tracking-tight">
          {value}
          {unit && <span className="ml-0.5 text-sm font-medium">{unit}</span>}
        </span>
        {delta && (
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
        )}
      </span>
    </div>
  );
}
