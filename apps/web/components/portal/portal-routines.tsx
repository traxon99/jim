"use client";

import { RoutineIcon } from "@/components/routines/routine-icon";
import type { PortalPlansData, PortalRoutine } from "@/lib/portal/plans-data";
import { WEEKDAY_NAMES } from "@/lib/programs/weekdays";
import { formatLastDone } from "@/lib/routines/last-done";
import {
  formatProgramWeek,
  groupRoutinesByFolder,
  isWarmupRoutine,
  programWeekProgress,
  searchRoutines,
} from "@jim/core";
import { Flame, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { PortalSectionHeader } from "./analysis-range";
import { useIsClient } from "./use-is-client";

const HEADING = "text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500";

function RoutineMark({ routine }: { routine: PortalRoutine }) {
  return isWarmupRoutine(routine) ? (
    <Flame
      className="h-4 w-4 shrink-0 text-orange-500 dark:text-orange-400"
      strokeWidth={1.75}
      aria-hidden="true"
    />
  ) : (
    <RoutineIcon shape={routine.iconShape} color={routine.iconColor} />
  );
}

/**
 * The Analysis Routines section (issue #470): workouts scheduled ahead,
 * programs with their schedules, and every routine with its exercises and
 * targets. Read-only; routines and programs are edited on the phone.
 */
export function PortalRoutines({ data }: { data: PortalPlansData }) {
  const isClient = useIsClient();
  const [query, setQuery] = useState("");
  const routineById = useMemo(
    () => new Map(data.routines.map((routine) => [routine.id, routine])),
    [data.routines],
  );
  const groups = useMemo(() => {
    const strength = data.routines.filter((routine) => !isWarmupRoutine(routine));
    const warmups = data.routines
      .filter(isWarmupRoutine)
      .sort((a, b) => a.name.localeCompare(b.name));
    const folders = groupRoutinesByFolder(strength).map((group) => ({
      label: group.folder,
      routines: group.routines,
    }));
    return warmups.length > 0 ? [...folders, { label: "Warm-ups", routines: warmups }] : folders;
  }, [data.routines]);
  const searchResults = useMemo(() => {
    if (!query.trim()) return null;
    const names = new Map(
      data.routines.map((routine) => [routine.id, routine.items.map((item) => item.name)]),
    );
    return searchRoutines(
      groups.flatMap((group) => group.routines),
      query,
      names,
    );
  }, [query, groups, data.routines]);

  const [selectedId, setSelectedId] = useState<string | null>(groups[0]?.routines[0]?.id ?? null);
  const selected = selectedId ? routineById.get(selectedId) : undefined;
  const detailRef = useRef<HTMLElement>(null);
  function openRoutine(id: string) {
    setSelectedId(id);
    detailRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  // "Coming up" keeps today's and later ones, by the browser's calendar.
  const upcoming = useMemo(() => {
    if (!isClient) return [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return data.scheduled.filter((entry) => new Date(entry.scheduledFor) >= today);
  }, [isClient, data.scheduled]);

  function routineButton(routineId: string | null, fallback: string) {
    const routine = routineId ? routineById.get(routineId) : undefined;
    if (!routine) return <span className="text-zinc-500 dark:text-zinc-500">{fallback}</span>;
    return (
      <button
        type="button"
        onClick={() => openRoutine(routine.id)}
        className="flex min-w-0 items-center gap-2 text-left font-medium hover:underline"
      >
        <RoutineMark routine={routine} />
        <span className="truncate">{routine.name}</span>
      </button>
    );
  }

  const listed = searchResults ?? groups.flatMap((group) => group.routines);

  return (
    <div className="route-fade flex flex-col gap-6">
      <PortalSectionHeader title="Routines" />

      <section className="flex flex-col gap-2">
        <h2 className={HEADING}>Coming up</h2>
        {!isClient ? null : upcoming.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">
            Nothing scheduled. Workouts Claude plans for you through Jim&apos;s MCP server show up
            here.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {upcoming.map((entry) => (
              <li
                key={entry.id}
                className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1 px-3 py-2 text-sm"
              >
                <span className="w-44 shrink-0 tabular-nums text-zinc-600 dark:text-zinc-400">
                  {new Date(entry.scheduledFor).toLocaleString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                {routineButton(entry.routineId, "Workout")}
                {entry.notes && (
                  <span className="allow-pwa-select min-w-0 basis-full text-xs text-zinc-500 sm:basis-auto dark:text-zinc-500">
                    {entry.notes}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.programs.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className={HEADING}>Programs</h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {data.programs.map((program) => {
              const progress =
                isClient && program.isActive
                  ? programWeekProgress(
                      {
                        durationWeeks: program.durationWeeks,
                        activatedAt: program.activatedAt ? new Date(program.activatedAt) : null,
                      },
                      new Date(),
                    )
                  : null;
              return (
                <li
                  key={program.id}
                  className="flex min-w-0 flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="min-w-0 text-base font-semibold">{program.name}</h3>
                    {program.isActive && (
                      <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-500">
                    {program.mode === "weekly" ? "Weekly schedule" : "Rotation, in order"}
                    {program.durationWeeks ? ` · ${program.durationWeeks} weeks` : ""}
                    {progress ? ` · ${formatProgramWeek(progress)}` : ""}
                  </p>
                  {program.notes && (
                    <p className="allow-pwa-select text-sm text-zinc-600 dark:text-zinc-400">
                      {program.notes}
                    </p>
                  )}
                  <ol className="flex flex-col gap-1 text-sm">
                    {(program.mode === "weekly"
                      ? [...program.items].sort(
                          (a, b) =>
                            (((a.weekday ?? 0) - data.weekStart + 7) % 7) -
                            (((b.weekday ?? 0) - data.weekStart + 7) % 7),
                        )
                      : program.items
                    ).map((item, index) => (
                      <li key={item.id} className="flex min-w-0 items-center gap-3">
                        <span className="w-24 shrink-0 text-xs text-zinc-500 dark:text-zinc-500">
                          {program.mode === "weekly" && item.weekday != null
                            ? WEEKDAY_NAMES[item.weekday]
                            : `Day ${index + 1}`}
                        </span>
                        {routineButton(item.routineId, "Rest")}
                      </li>
                    ))}
                  </ol>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className={HEADING}>Routines</h2>
        {data.routines.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">
            No routines yet. Make one in Jim under Routines.
          </p>
        ) : (
          <div className="grid items-start gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div className="flex min-w-0 flex-col gap-3">
              <label className="relative flex items-center">
                <Search
                  className="pointer-events-none absolute left-3 h-4 w-4 text-zinc-400"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <input
                  type="search"
                  aria-label="Search routines"
                  placeholder="Search routines or exercises"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="min-h-11 w-full min-w-0 rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-base text-zinc-950 md:text-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                />
              </label>
              {searchResults && searchResults.length === 0 ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-500">
                  No routines match “{query.trim()}”.
                </p>
              ) : (
                (searchResults ? [{ label: null, routines: listed }] : groups).map((group) => (
                  <div key={group.label ?? "none"} className="flex flex-col gap-1">
                    {group.label && (
                      <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-500">
                        {group.label}
                      </h3>
                    )}
                    <ul className="flex flex-col">
                      {group.routines.map((routine) => (
                        <li key={routine.id}>
                          <button
                            type="button"
                            aria-pressed={routine.id === selectedId}
                            onClick={() => openRoutine(routine.id)}
                            className={`flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-md px-2 text-left ${
                              routine.id === selectedId
                                ? "bg-zinc-100 dark:bg-zinc-900"
                                : "hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                            }`}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <RoutineMark routine={routine} />
                              <span className="truncate text-sm font-medium">{routine.name}</span>
                            </span>
                            <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-500">
                              {routine.items.length} exercise
                              {routine.items.length === 1 ? "" : "s"}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>

            <section
              ref={detailRef}
              aria-label="Routine"
              className="flex min-w-0 scroll-mt-4 flex-col gap-3 rounded-lg border border-zinc-200 p-4 md:sticky md:top-4 dark:border-zinc-800"
            >
              {selected ? (
                <RoutineDetail
                  routine={selected}
                  warmup={
                    selected.warmupRoutineId ? routineById.get(selected.warmupRoutineId) : undefined
                  }
                  onOpenRoutine={openRoutine}
                  isClient={isClient}
                />
              ) : (
                <p className="text-sm text-zinc-500 dark:text-zinc-500">Pick a routine.</p>
              )}
            </section>
          </div>
        )}
      </section>
    </div>
  );
}

function RoutineDetail({
  routine,
  warmup,
  onOpenRoutine,
  isClient,
}: {
  routine: PortalRoutine;
  warmup: PortalRoutine | undefined;
  onOpenRoutine: (id: string) => void;
  isClient: boolean;
}) {
  const lastDone = routine.lastDoneAt ? new Date(routine.lastDoneAt) : null;
  return (
    <>
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="flex min-w-0 items-center gap-2 text-lg font-semibold">
          <RoutineMark routine={routine} />
          <span className="min-w-0 break-words">{routine.name}</span>
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          {[
            isWarmupRoutine(routine) ? "Warm-up" : routine.folder,
            `${routine.items.length} exercise${routine.items.length === 1 ? "" : "s"}`,
            isClient
              ? lastDone
                ? `Last done ${formatLastDone(lastDone).toLowerCase()}`
                : "Not done yet"
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      {routine.notes && (
        <p className="allow-pwa-select whitespace-pre-line text-sm text-zinc-600 dark:text-zinc-400">
          {routine.notes}
        </p>
      )}
      {warmup && (
        <p className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-zinc-600 dark:text-zinc-400">
          Starts with the warm-up
          <button
            type="button"
            onClick={() => onOpenRoutine(warmup.id)}
            className="font-medium text-zinc-950 hover:underline dark:text-zinc-50"
          >
            {warmup.name}
          </button>
        </p>
      )}
      {routine.items.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-500">No exercises yet.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {routine.items.map((item) => (
            <li key={item.id} className="flex min-w-0 flex-col gap-0.5 py-2.5">
              <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                {item.supersetLabel && (
                  <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                    {item.supersetLabel}
                  </span>
                )}
                <Link
                  href={`/portal/exercises/${item.exerciseId}`}
                  className="min-w-0 truncate hover:underline"
                >
                  {item.name}
                </Link>
              </span>
              {item.summary && (
                <span className="allow-pwa-select text-xs tabular-nums text-zinc-500 dark:text-zinc-500">
                  {item.summary}
                </span>
              )}
              {item.notes && (
                <span className="allow-pwa-select text-xs text-zinc-500 dark:text-zinc-500">
                  {item.notes}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
