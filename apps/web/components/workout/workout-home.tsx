"use client";

import { BlockEndCard } from "@/components/dpr/block-end-card";
import { DprWorkoutBadge } from "@/components/dpr/dpr-workout-badge";
import { TryDprCard } from "@/components/dpr/try-dpr-card";
import { LoadingText } from "@/components/loading-text";
import { FLOATING_BUTTON, PAGE_BODY, PageHeader, SECTION_LABEL } from "@/components/page-header";
import { ProgramWeekStrip, useProgramCycle } from "@/components/routines/program-week-strip";
import { RoutineIconTile } from "@/components/routines/routine-icon";
import { SickDayChip, SickTodayCard, useSickToday } from "@/components/sick-days/sick-day-controls";
import { type RoutineExerciseRow, db } from "@/lib/db/schema";
import { dprCallsForRoutine } from "@/lib/dpr/calls";
import { useDprContext } from "@/lib/dpr/use-dpr-calls";
import { useGyms } from "@/lib/gyms/use-gyms";
import { useHasOpenInjury } from "@/lib/injuries/use-injuries";
import { useToday } from "@/lib/pwa/use-today";
import { formatLastDone, lastDoneByRoutine } from "@/lib/routines/last-done";
import { startSmartSession } from "@/lib/sessions/smart-workout";
import { startEmptySession, startSessionFromRoutineId } from "@/lib/sessions/start-session";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { type SessionIntensity, groupRoutinesByFolder } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { Play, Plus, Thermometer, TrendingUp, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PreWorkoutSheet } from "./pre-workout-sheet";
import { UpNextCard } from "./up-next-card";

/**
 * Empty, Smart and Sick day share one row on Lift (#783) as tiles: a colored
 * icon over the label and a one-line hint (#787).
 */
const TILE =
  "surface press flex min-h-[92px] w-full min-w-0 flex-col items-start gap-2 p-3 text-left disabled:opacity-50";

const EYEBROW_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "short",
  day: "numeric",
});

function QuickTile({
  icon,
  tint,
  label,
  hint,
}: {
  icon: React.ReactNode;
  /** Fixed hues tell the three actions apart, like iOS Settings icons. */
  tint: string;
  label: string;
  hint: string;
}) {
  return (
    <>
      <span
        aria-hidden="true"
        className={`flex h-[30px] w-[30px] items-center justify-center rounded-[9px] text-white ${tint}`}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[15px] font-semibold tracking-[-0.012em]">{label}</span>
        <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">{hint}</span>
      </span>
    </>
  );
}

export function WorkoutHome({ userId }: { userId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const today = useToday();
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  // The routine waiting on the pre-workout sheet (issue #235); opened by the
  // Start button for DPR users and by tapping a routine for everyone (#282).
  const [preview, setPreview] = useState<{ id: string; name: string } | null>(null);

  const rawSessions = useLiveQuery(() => db.sessions.toArray(), []);
  const rawRoutines = useLiveQuery(() => db.routines.toArray(), []);
  const dprContext = useDprContext();
  const gyms = useGyms();
  const hasOpenInjury = useHasOpenInjury();
  const sickToday = useSickToday();
  const settings = useLiveQuery(() => db.settings.get("me"), []) ?? DEFAULT_SETTINGS;
  // The week strip and up next lead Lift (#783); the up-next routine is left
  // out of "Other routines" below it.
  const { suggestion, cycle } = useProgramCycle(settings.weekStart);
  const upNextId = suggestion?.next && suggestion.routine ? suggestion.routine.id : null;
  const itemsByRoutine = useLiveQuery(async () => {
    const map = new Map<string, RoutineExerciseRow[]>();
    if (!dprContext) return map;
    for (const item of await db.routineExercises.toArray()) {
      const list = map.get(item.routineId) ?? [];
      list.push(item);
      map.set(item.routineId, list);
    }
    return map;
  }, [dprContext !== null]);

  const activeSession = useMemo(
    () => (rawSessions ?? []).find((session) => !session.endedAt && !session.deletedAt) ?? null,
    [rawSessions],
  );

  // This tab stays mounted (hidden) even when another tab is showing
  // (components/tabbed-shell.tsx), so gate the redirect on actually being
  // the visible tab — otherwise landing on /history with a session already
  // in progress would silently bounce the user to /workout.
  useEffect(() => {
    if (activeSession && pathname === "/workout") router.replace(`/workout/${activeSession.id}`);
  }, [activeSession, pathname, router]);

  // Because this tab stays mounted, `starting` would otherwise survive the
  // round trip into the session and back (e.g. cancelling the workout),
  // leaving the Start buttons permanently disabled. Once navigation has
  // actually left /workout, the flag has done its job of blocking a double
  // start — clear it so the buttons work again whenever we return here.
  useEffect(() => {
    if (pathname !== "/workout") {
      setStarting(false);
      setPreview(null);
    }
  }, [pathname]);

  const completedSessionCount = useMemo(
    () => (rawSessions ?? []).filter((session) => session.endedAt && !session.deletedAt).length,
    [rawSessions],
  );

  const lastDone = useMemo(() => lastDoneByRoutine(rawSessions ?? []), [rawSessions]);

  const routinesById = useMemo(
    () => new Map((rawRoutines ?? []).map((routine) => [routine.id, routine])),
    [rawRoutines],
  );

  const routineGroups = useMemo(
    () =>
      groupRoutinesByFolder(
        (rawRoutines ?? []).filter((routine) => !routine.deletedAt && routine.id !== upNextId),
      ),
    [rawRoutines, upNextId],
  );

  // Nothing was started if this throws, so free the buttons and say so
  // (issue #517); on success `starting` stays set until we leave /workout.
  async function start(begin: () => Promise<string>) {
    setStarting(true);
    setStartError(null);
    try {
      router.push(`/workout/${await begin()}`);
    } catch {
      setStarting(false);
      setStartError("Couldn't start the workout. Try again.");
    }
  }

  function handleStartEmpty() {
    return start(() => startEmptySession(userId));
  }

  // Issue #280: an ad hoc workout aimed at the muscles trained least lately.
  function handleStartSmart() {
    return start(() => startSmartSession(userId));
  }

  const closePreview = useCallback(() => setPreview(null), []);

  // DPR users see today's targets and pick an intensity first (issue #235),
  // users with gyms pick one (issue #454), and anyone with an open injury
  // checks in (issue #627); everyone else starts straight away.
  function handleChooseRoutine(routineId: string, routineName: string) {
    if (dprContext || (gyms && gyms.length > 0) || hasOpenInjury) {
      setPreview({ id: routineId, name: routineName });
    } else void handleStartFromRoutine(routineId, null, null);
  }

  // Tapping a routine previews it in the sheet, DPR or not (issue #282).
  function handlePreviewRoutine(routineId: string, routineName: string) {
    if (!starting) setPreview({ id: routineId, name: routineName });
  }

  function handleStartFromRoutine(
    routineId: string,
    intensity: SessionIntensity | null,
    gymId: string | null,
  ) {
    return start(() => startSessionFromRoutineId(userId, routineId, intensity, db, gymId));
  }

  if (rawSessions === undefined || activeSession) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <LoadingText />
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader
        title="Lift"
        eyebrow={EYEBROW_FORMAT.format(today)}
        actions={
          // PRP Progress moved here from History's shortcuts (#783).
          <Link href="/progression" aria-label="Progress" data-ripple className={FLOATING_BUTTON}>
            <TrendingUp className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
          </Link>
        }
      />
      <div className={PAGE_BODY}>
        {suggestion && cycle && cycle.days.length > 0 && (
          <div className="surface px-2 pt-3 pb-2">
            <ProgramWeekStrip
              programId={suggestion.program.id}
              mode={suggestion.program.mode}
              cycle={cycle}
              routinesById={routinesById}
            />
          </div>
        )}
        <BlockEndCard context={dprContext} />

        {startError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-500">
            {startError}
          </p>
        )}

        {/* A sick day (issue #779) leads, but training still works the same:
          a sick day and a workout can share a day (#781). */}
        {sickToday && <SickTodayCard userId={userId} sick />}
        <UpNextCard starting={starting} onStart={handleChooseRoutine} />

        {/* The ways to start without a routine, one compact row (#783). */}
        <div className={`grid gap-2 ${sickToday === false ? "grid-cols-3" : "grid-cols-2"}`}>
          <button
            type="button"
            onClick={() => void handleStartEmpty()}
            disabled={starting}
            aria-label="Start empty workout"
            className={TILE}
          >
            <QuickTile
              icon={<Plus className="h-[17px] w-[17px]" strokeWidth={2.2} />}
              tint="bg-zinc-500"
              label="Empty"
              hint="Log freely"
            />
          </button>
          <button
            type="button"
            onClick={() => void handleStartSmart()}
            disabled={starting}
            aria-label="Smart workout, balances recent volume"
            className={TILE}
          >
            <QuickTile
              icon={<Zap className="h-[17px] w-[17px]" strokeWidth={2.2} />}
              tint="bg-violet-500"
              label="Smart"
              hint="Built for today"
            />
          </button>
          {sickToday === false && (
            <SickDayChip
              userId={userId}
              className={TILE}
              content={
                <QuickTile
                  icon={<Thermometer className="h-[17px] w-[17px]" strokeWidth={2.2} />}
                  tint="bg-cyan-600"
                  label="Sick day"
                  hint="Keeps your streak"
                />
              }
            />
          )}
        </div>

        {/* Your routines (issue #329); with a program, the up-next one is
          already above, so these are the others. */}
        {routineGroups.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="-mb-1 flex items-center justify-between gap-2 px-1">
              <h2 className={SECTION_LABEL}>
                {upNextId ? "Other routines" : "Start from a routine"}
              </h2>
              <Link
                href="/routines?view=routines"
                className="flex min-h-11 items-center text-[15px] font-medium text-accent"
              >
                All in Plan
              </Link>
            </div>
            {routineGroups.map((group) => (
              <section key={group.folder ?? "__ungrouped"} className="flex flex-col gap-1">
                {group.folder && <h3 className={`${SECTION_LABEL} px-1`}>{group.folder}</h3>}
                <ul className="surface flex flex-col overflow-hidden">
                  {group.routines.map((routine) => (
                    <li
                      key={routine.id}
                      className="relative flex items-center justify-between gap-2 py-2 pr-3 pl-3.5 before:absolute before:top-0 before:right-0 before:left-[58px] before:border-t before:border-zinc-900/10 first:before:hidden dark:before:border-white/10"
                    >
                      <button
                        type="button"
                        onClick={() => handlePreviewRoutine(routine.id, routine.name)}
                        data-ripple
                        className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <RoutineIconTile shape={routine.iconShape} color={routine.iconColor} />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-base font-semibold tracking-[-0.014em]">
                            {routine.name}
                          </span>
                          <span className="text-sm text-zinc-500 dark:text-zinc-400">
                            {(() => {
                              const done = lastDone.get(routine.id);
                              return done ? formatLastDone(done) : "Not done yet";
                            })()}
                          </span>
                        </span>
                      </button>
                      {/* One badge instead of inline chips; the details open
                        in a floating card (issue #284). */}
                      {dprContext && (
                        <DprWorkoutBadge
                          context={dprContext}
                          calls={dprCallsForRoutine(
                            dprContext,
                            itemsByRoutine?.get(routine.id) ?? [],
                          )}
                          routineName={routine.name}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => handleChooseRoutine(routine.id, routine.name)}
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
              </section>
            ))}
          </div>
        )}

        <TryDprCard completedSessionCount={completedSessionCount} />

        {preview && (
          <PreWorkoutSheet
            context={dprContext}
            routineId={preview.id}
            routineName={preview.name}
            starting={starting}
            onStart={(intensity, gymId) =>
              void handleStartFromRoutine(preview.id, intensity, gymId)
            }
            onCancel={closePreview}
          />
        )}
      </div>
    </main>
  );
}
