"use client";

import { SECTION_LABEL } from "@/components/page-header";
import { UndoBar, useUndoable } from "@/components/undo-bar";
import { mutate } from "@/lib/db/mutate";
import { type RoutineRow, db } from "@/lib/db/schema";
import { useToday } from "@/lib/pwa/use-today";
import { getDeviceId } from "@/lib/sync/engine";
import {
  KEEP_AS_ROUTINE,
  dayKey,
  finishedRoutineIds,
  formatDayKey,
  oneOffStatus,
  oneOffTimeLeft,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { BookmarkPlus, Hourglass, Play, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const TICK_MS = 60_000;
/** Exercises listed on the card before "N more exercises". */
const SHOWN_EXERCISES = 3;

/** The time, refreshed each minute, so a 24-hour one-off drains and ends while Lift is open. */
function useMinuteNow(): Date {
  const today = useToday();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  // useToday also moves on when the app comes back to the foreground.
  return today.getTime() > now.getTime() ? today : now;
}

/**
 * The user's one-off workouts (issue #798) that haven't ended, split into
 * today's (`live`) and later days' (`upcoming`). `undefined` while loading.
 */
export function useOneOffs() {
  const now = useMinuteNow();
  const routines = useLiveQuery(() => db.routines.filter((r) => r.oneOff).toArray(), []);
  const sessions = useLiveQuery(() => db.sessions.toArray(), []);
  return useMemo(() => {
    if (!routines || !sessions) return undefined;
    const clock = { now, today: dayKey(now), finished: finishedRoutineIds(sessions) };
    const byStatus = (status: "live" | "upcoming") =>
      routines
        .filter((routine) => oneOffStatus(routine, clock) === status)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return { now, live: byStatus("live"), upcoming: byStatus("upcoming") };
  }, [routines, sessions, now]);
}

/**
 * How much time is left, as a ring around an hourglass that drains toward
 * the deadline. With no deadline (until done) it's just the hourglass.
 */
function TimeLeftRing({ left }: { left: number | null }) {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  return (
    <span
      aria-hidden="true"
      className="relative flex h-10 w-10 shrink-0 items-center justify-center"
    >
      {left !== null && (
        <svg
          viewBox="0 0 40 40"
          aria-hidden="true"
          className="absolute inset-0 h-10 w-10 -rotate-90"
        >
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill="none"
            strokeWidth="3.5"
            className="stroke-zinc-900/10 dark:stroke-white/15"
          />
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill="none"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - left)}
            className="stroke-zinc-900 transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none dark:stroke-white"
          />
        </svg>
      )}
      <Hourglass
        className={left === null ? "h-6 w-6 text-zinc-500 dark:text-zinc-400" : "h-5 w-5"}
        strokeWidth={2}
      />
    </span>
  );
}

function targetLabel(item: {
  targetSets: number | null;
  targetRepsLow: number | null;
  targetRepsHigh: number | null;
  targetDurationSeconds: number | null;
}): string {
  const reps =
    item.targetRepsLow !== null &&
    item.targetRepsHigh !== null &&
    item.targetRepsHigh !== item.targetRepsLow
      ? `${item.targetRepsLow}–${item.targetRepsHigh}`
      : (item.targetRepsLow ??
        item.targetRepsHigh ??
        (item.targetDurationSeconds !== null ? `${item.targetDurationSeconds}s` : null));
  if (item.targetSets !== null && reps !== null) return `${item.targetSets} × ${reps}`;
  if (item.targetSets !== null) return `${item.targetSets} sets`;
  return reps === null ? "" : String(reps);
}

/** Local midnight to midnight for a YYYY-MM-DD day, for a day one-off's ring. */
function localDay(day: string): { start: Date; end: Date } {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return { start: new Date(year, month - 1, date), end: new Date(year, month - 1, date + 1) };
}

function OneOffCard({
  routine,
  now,
  starting,
  onStart,
  onDiscard,
  onKeep,
}: {
  routine: RoutineRow;
  now: Date;
  starting: boolean;
  onStart: () => void;
  onDiscard: () => void;
  onKeep: () => void;
}) {
  const rows = useLiveQuery(async () => {
    const items = (await db.routineExercises.where("routineId").equals(routine.id).toArray())
      .filter((item) => !item.deletedAt)
      .sort((a, b) => a.position - b.position);
    const exercises = await db.exercises.bulkGet(items.map((item) => item.exerciseId));
    return items.map((item, index) => ({
      id: item.id,
      name: exercises[index]?.name ?? "Exercise",
      target: targetLabel(item),
    }));
  }, [routine.id]);
  const left = oneOffTimeLeft(
    routine,
    now,
    routine.oneOffDay ? localDay(routine.oneOffDay) : undefined,
  );

  // The ring has no text, so say the time left to screen readers (LESSONS, #529).
  const timeLeft = routine.oneOffExpiresAt
    ? `${Math.max(1, Math.ceil((routine.oneOffExpiresAt.getTime() - now.getTime()) / 3_600_000))} hours left`
    : routine.oneOffDay
      ? "until the end of today"
      : "until you finish it";

  return (
    <section
      aria-label={`${routine.name}, ${timeLeft}`}
      className="flex flex-col rounded-[22px] border-[1.5px] border-dashed border-zinc-900/25 bg-white/55 p-4 dark:border-white/25 dark:bg-zinc-900/55"
    >
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="text-[26px] leading-[1.1] font-bold tracking-[-0.024em] [overflow-wrap:anywhere]">
            {routine.name}
          </h3>
          {rows && (
            <span className="mt-1 text-[15px] text-zinc-600 dark:text-zinc-400">
              {rows.length} exercise{rows.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <TimeLeftRing left={left} />
      </div>
      {rows && rows.length > 0 && (
        <ul className="mt-3">
          {rows.slice(0, SHOWN_EXERCISES).map((row) => (
            <li
              key={row.id}
              className="flex min-h-[46px] items-center justify-between gap-3 border-t border-zinc-900/10 text-base dark:border-white/10"
            >
              <span className="min-w-0 truncate">{row.name}</span>
              <span className="shrink-0 text-[15px] tabular-nums text-zinc-500 dark:text-zinc-400">
                {row.target}
              </span>
            </li>
          ))}
          {rows.length > SHOWN_EXERCISES && (
            <li className="flex min-h-[46px] items-center border-t border-zinc-900/10 text-[15px] text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              {rows.length - SHOWN_EXERCISES} more exercise
              {rows.length - SHOWN_EXERCISES === 1 ? "" : "s"}
            </li>
          )}
        </ul>
      )}
      <div className="mt-3.5 flex gap-2.5">
        <button
          type="button"
          onClick={onStart}
          disabled={starting}
          className="press flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-full bg-zinc-900 px-4 text-[17px] font-semibold tracking-[-0.015em] text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
        >
          <Play className="h-3.5 w-3.5 fill-current" strokeWidth={2} aria-hidden="true" />
          Start
        </button>
        <button
          type="button"
          onClick={onKeep}
          aria-label={`Save ${routine.name} as a routine`}
          className="press flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-zinc-900/[0.06] dark:bg-white/10"
        >
          <BookmarkPlus className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onDiscard}
          aria-label={`Discard ${routine.name}`}
          className="press flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-zinc-900/[0.06] dark:bg-white/10"
        >
          <X className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

/** Saves a one-off as a normal routine at the end of the list ("Save as routine"). */
export async function keepOneOff(routine: RoutineRow): Promise<void> {
  const position = await db.routines.filter((r) => !r.deletedAt && !r.oneOff).count();
  await mutate("routines", {
    ...routine,
    ...KEEP_AS_ROUTINE,
    position,
    updatedAt: new Date(),
    deviceId: await getDeviceId(),
  });
}

async function setDeleted(routine: RoutineRow, deletedAt: Date | null): Promise<void> {
  await mutate("routines", {
    ...routine,
    deletedAt,
    updatedAt: new Date(),
    deviceId: await getDeviceId(),
  });
}

/**
 * Lift's one-off workouts (issue #798): today's lead the tab as dashed
 * cards, and later days' wait in a compact list that can still be started
 * early. No "one-off" wording: the dashed outline and the hourglass say it.
 */
export function OneOffCards({
  oneOffs,
  starting,
  onStart,
}: {
  oneOffs: ReturnType<typeof useOneOffs>;
  starting: boolean;
  onStart: (routineId: string, routineName: string) => void;
}) {
  const undo = useUndoable<RoutineRow>();

  if (!oneOffs) return null;
  const { live, upcoming, now } = oneOffs;
  if (live.length === 0 && upcoming.length === 0 && !undo.label) return null;

  async function handleDiscard(routine: RoutineRow) {
    await setDeleted(routine, new Date());
    undo.offer(`Discarded ${routine.name}`, routine);
  }

  async function handleUndo() {
    const routine = undo.take();
    if (routine) await setDeleted(routine, null);
  }

  return (
    <>
      {live.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className={`${SECTION_LABEL} px-1`}>Today</h2>
          {live.map((routine) => (
            <OneOffCard
              key={routine.id}
              routine={routine}
              now={now}
              starting={starting}
              onStart={() => onStart(routine.id, routine.name)}
              onDiscard={() => void handleDiscard(routine)}
              onKeep={() => void keepOneOff(routine)}
            />
          ))}
        </div>
      )}
      {upcoming.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className={`${SECTION_LABEL} px-1`}>Coming up</h2>
          <ul className="flex flex-col overflow-hidden rounded-2xl border-[1.5px] border-dashed border-zinc-900/25 dark:border-white/25">
            {upcoming.map((routine) => (
              <li
                key={routine.id}
                className="relative flex items-center gap-3 py-2 pr-3 pl-3.5 before:absolute before:top-0 before:right-0 before:left-3.5 before:border-t before:border-zinc-900/10 first:before:hidden dark:before:border-white/10"
              >
                <Hourglass
                  className="h-5 w-5 shrink-0 text-zinc-500 dark:text-zinc-400"
                  strokeWidth={2}
                  aria-hidden="true"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-base font-semibold tracking-[-0.014em]">
                    {routine.name}
                  </span>
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    {routine.oneOffDay ? formatDayKey(routine.oneOffDay, dayKey(now)) : ""}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onStart(routine.id, routine.name)}
                  disabled={starting}
                  aria-label={`Start ${routine.name}`}
                  className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-900/[0.06] disabled:opacity-50 dark:bg-white/10"
                >
                  <Play
                    className="ml-0.5 h-3.5 w-3.5 fill-current"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {undo.label && <UndoBar label={undo.label} onUndo={() => void handleUndo()} />}
    </>
  );
}
