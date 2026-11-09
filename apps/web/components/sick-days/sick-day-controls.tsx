"use client";

import { type SickDayRow, db } from "@/lib/db/schema";
import { useTodayKey } from "@/lib/injuries/use-injuries";
import { markSickDay, unmarkSickDay } from "@/lib/sick-days";
import { useLiveQuery } from "dexie-react-hooks";
import { Thermometer } from "lucide-react";
import { useCallback, useRef, useState } from "react";

/** The live sick-day row for `day`, null when it isn't sick, undefined while loading. */
function useSickDayRow(day: string): SickDayRow | null | undefined {
  return useLiveQuery(
    async () =>
      (await db.sickDays.where("day").equals(day).toArray())
        .filter((row) => !row.deletedAt)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0] ?? null,
    [day],
  );
}

/**
 * Marks or unmarks one day (issue #779). One write at a time; the busy flag
 * clears on every exit path, and a failure shows beside the control.
 */
function useSickDayAction(userId: string, day: string) {
  const row = useSickDayRow(day);
  const today = useTodayKey();
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = useCallback(
    async (sick: boolean) => {
      if (busyRef.current) return;
      // Unmarking loses the note, so ask first when there is one.
      if (!sick && row?.note && !window.confirm("Unmark this sick day? Its note is removed too."))
        return;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      try {
        if (sick) await markSickDay({ userId, day, today });
        else await unmarkSickDay(day);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Couldn't save the sick day");
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [userId, day, today, row?.note],
  );

  return { row, isFuture: day > today, busy, error, set };
}

/**
 * The History day toggle: marks the picked day as a sick day, or unmarks it.
 * Hidden for days after today.
 */
export function SickDayToggle({ userId, day }: { userId: string; day: string }) {
  const { row, isFuture, busy, error, set } = useSickDayAction(userId, day);
  if (row === undefined || isFuture) return null;
  const sick = row !== null;
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        aria-pressed={sick}
        disabled={busy}
        onClick={() => void set(!sick)}
        className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium disabled:opacity-50 ${
          sick
            ? "border-zinc-400 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900"
            : "border-zinc-300 dark:border-zinc-700"
        }`}
      >
        <Thermometer className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        {sick ? "Sick day · tap to unmark" : "Mark as sick day"}
      </button>
      {row?.note && <p className="text-xs text-zinc-500 dark:text-zinc-500">Note: {row.note}</p>}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}

/** Whether today is marked sick; undefined while loading. */
export function useSickToday(): boolean | undefined {
  const row = useSickDayRow(useTodayKey());
  return row === undefined ? undefined : row !== null;
}

/**
 * The Workout tab's sick-day card (issue #779): while today is marked sick
 * it takes the up-next spot; otherwise it's a quiet "Feeling sick?" link.
 */
export function SickTodayCard({ userId, sick }: { userId: string; sick: boolean }) {
  const today = useTodayKey();
  const { busy, error, set } = useSickDayAction(userId, today);

  if (!sick) {
    return (
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => void set(true)}
          className="flex min-h-11 items-center gap-1.5 px-2 text-sm font-medium text-zinc-500 underline underline-offset-4 disabled:opacity-50 dark:text-zinc-500"
        >
          <Thermometer className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Feeling sick? Take a sick day
        </button>
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-500">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <section
      aria-label="Sick day"
      className="flex flex-col gap-3 rounded-xl border border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900"
    >
      <span className="flex items-center gap-2 text-lg font-semibold">
        <Thermometer className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        Sick day
      </span>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Rest up. A sick day doesn't break your streak, and a PRP block waits for you.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void set(false)}
        className="min-h-11 rounded-lg border border-zinc-300 px-4 py-3 text-base font-medium disabled:opacity-50 dark:border-zinc-700"
      >
        Feeling better
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-500">
          {error}
        </p>
      )}
    </section>
  );
}
