"use client";

import { PAGE_BODY, PageHeader } from "@/components/page-header";
import type { InjuryRow, PainCheckinRow } from "@/lib/db/schema";
import {
  deleteInjury,
  injuryHistoryByArea,
  logPain,
  markHealed,
  sortOpenInjuries,
} from "@/lib/injuries";
import { useInjuries, useTodayKey } from "@/lib/injuries/use-injuries";
import { formatDayKey, injuryAreaLabel, latestPainByDay, todaysPain } from "@jim/core";
import { Bandage } from "lucide-react";
import { useState } from "react";
import { HealedPrompt } from "./pain-checkin";
import { PainPicker } from "./pain-picker";
import { ReportInjuryCard } from "./report-injury-card";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Runs a save, showing its failure next to the buttons (docs/LESSONS.md, Taps). */
function useSaveError() {
  const [error, setError] = useState<string | null>(null);
  const run = (save: Promise<unknown>) => {
    setError(null);
    save.catch((caught: unknown) =>
      setError(caught instanceof Error ? caught.message : "Couldn't save. Try again."),
    );
  };
  return { error, run };
}

function SaveError({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm text-red-600 dark:text-red-500">
      {error}
    </p>
  ) : null;
}
const RECENT_DAYS = 7;

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / DAY_MS,
  );
}

/** The `count` days ending with `today`, oldest first. */
function recentDays(today: string, count: number): string[] {
  const end = new Date(`${today}T12:00:00Z`).getTime();
  return Array.from({ length: count }, (_, i) =>
    new Date(end - (count - 1 - i) * DAY_MS).toISOString().slice(0, 10),
  );
}

function sinceLine(injury: InjuryRow, today: string): string {
  const days = daysBetween(injury.startedOn, today);
  return `Since ${formatDayKey(injury.startedOn, today)} · ${
    days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"}`
  }`;
}

/** The last week's pain, one cell per day; a day without a check-in stays blank. */
function RecentPain({
  injury,
  checkins,
  today,
}: {
  injury: InjuryRow;
  checkins: readonly PainCheckinRow[];
  today: string;
}) {
  const byDay = latestPainByDay(checkins, injury.id);
  const days = recentDays(today, RECENT_DAYS).filter((day) => day >= injury.startedOn);
  if (days.length < 2) return null;
  return (
    <ol className="grid grid-cols-7 gap-1 text-center text-xs" aria-label="Pain this week">
      {days.map((day) => {
        const level = byDay.get(day);
        const weekday = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
          weekday: "narrow",
          timeZone: "UTC",
        });
        return (
          <li
            key={day}
            aria-label={`${formatDayKey(day, today)}: ${level === undefined ? "no check-in" : `pain ${level}`}`}
            className="flex flex-col gap-0.5"
          >
            <span className="text-zinc-500 dark:text-zinc-500">{weekday}</span>
            <span className="rounded bg-zinc-100 py-1 font-semibold dark:bg-zinc-900">
              {level ?? "–"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function OpenInjuryCard({
  injury,
  checkins,
  today,
}: {
  injury: InjuryRow;
  checkins: readonly PainCheckinRow[];
  today: string;
}) {
  const label = injuryAreaLabel(injury.area, injury.side);
  const { error, run } = useSaveError();
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex min-w-0 flex-col">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Bandage className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span className="min-w-0 truncate">{label}</span>
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-500">{sinceLine(injury, today)}</p>
        {injury.note && (
          <p className="allow-pwa-select mt-1 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
            {injury.note}
          </p>
        )}
      </div>
      <RecentPain injury={injury} checkins={checkins} today={today} />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold">Pain today</p>
        <PainPicker
          value={todaysPain(checkins, injury.id, today)}
          label={`${label} pain today`}
          onChange={(level) => run(logPain(injury, level, today))}
        />
      </div>
      <HealedPrompt injury={injury} checkins={checkins} today={today} />
      <SaveError error={error} />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => run(markHealed(injury, today))}
          className="min-h-11 flex-1 rounded-lg border border-zinc-300 px-3 text-sm font-medium dark:border-zinc-700"
        >
          Mark healed
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Delete ${label.toLowerCase()} and its check-ins?`)) {
              run(deleteInjury(injury));
            }
          }}
          className="min-h-11 px-3 text-sm font-medium text-red-600 dark:text-red-500"
        >
          Delete
        </button>
      </div>
    </li>
  );
}

function HistoryRow({
  injury,
  checkins,
  today,
}: {
  injury: InjuryRow;
  checkins: readonly PainCheckinRow[];
  today: string;
}) {
  const healedOn = injury.healedOn ?? today;
  const days = daysBetween(injury.startedOn, healedOn);
  const levels = [...latestPainByDay(checkins, injury.id).values()];
  const peak = levels.length > 0 ? Math.max(...levels) : null;
  const label = injuryAreaLabel(injury.area, injury.side);
  const { error, run } = useSaveError();
  return (
    <li className="flex min-w-0 flex-col gap-1 py-2">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-medium">
            {formatDayKey(injury.startedOn, today)} – {formatDayKey(healedOn, today)}
          </span>
          <span className="text-xs text-zinc-500 dark:text-zinc-500">
            {days} day{days === 1 ? "" : "s"}
            {peak !== null ? ` · peak pain ${peak}` : ""}
            {injury.note ? ` · ${injury.note}` : ""}
          </span>
        </span>
        <span className="flex shrink-0">
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Delete this ${label.toLowerCase()} injury and its check-ins?`)) {
                run(deleteInjury(injury));
              }
            }}
            aria-label={`Delete ${label.toLowerCase()} from ${formatDayKey(injury.startedOn, today)}`}
            className="min-h-11 px-2 text-sm font-medium text-red-600 dark:text-red-500"
          >
            Delete
          </button>
        </span>
      </div>
      <SaveError error={error} />
    </li>
  );
}

/**
 * Profile → Injuries (issue #627): open injuries with today's check-in, for
 * rest days too, healing, and history grouped by area so a flare-up sits
 * with the earlier ones. Reads and writes IndexedDB, so it works offline.
 * Injuries are always private.
 */
export function InjuriesHome({ userId }: { userId: string }) {
  const data = useInjuries();
  const today = useTodayKey();
  const [reporting, setReporting] = useState(false);
  const open = sortOpenInjuries(data?.injuries ?? []);
  const history = injuryHistoryByArea(data?.injuries ?? []);
  const checkins = data?.checkins ?? [];

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader title="Injuries" back={{ href: "/profile", label: "Profile" }} />
      <div className={PAGE_BODY}>
        <button
          type="button"
          onClick={() => setReporting(true)}
          className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-base font-medium text-accent-foreground"
        >
          <Bandage className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Report an injury
        </button>

        {data && open.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">
            Nothing hurting. If something does, report it and Jim will flag the exercises that work
            it and suggest going light, swapping or skipping them.
          </p>
        )}

        {open.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
              Open
            </h2>
            <ul className="flex flex-col gap-3">
              {open.map((injury) => (
                <OpenInjuryCard key={injury.id} injury={injury} checkins={checkins} today={today} />
              ))}
            </ul>
          </section>
        )}

        {history.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
              History
            </h2>
            {history.map((group) => (
              <div key={group.label} className="flex flex-col">
                <h3 className="text-base font-semibold">{group.label}</h3>
                <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
                  {group.injuries.map((injury) => (
                    <HistoryRow key={injury.id} injury={injury} checkins={checkins} today={today} />
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}

        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          Injuries are private: they never show to friends, in the feed or on share links.
        </p>
      </div>

      {reporting && <ReportInjuryCard userId={userId} onClose={() => setReporting(false)} />}
    </main>
  );
}
