"use client";

import { CallMark } from "@/components/dpr/call-mark";
import { ExerciseNameButton } from "@/components/exercises/exercise-name-button";
import { FloatingCard } from "@/components/floating-card";
import {
  ArrowRight,
  ArrowUp,
  ChevronDown,
  Feather,
  type IconComponent,
  MapPin,
  Play,
  X,
} from "@/components/icons/solar";
import { PainCheckin } from "@/components/injuries/pain-checkin";
import { SEGMENTED_TRACK, segmentClass } from "@/components/routines/plan-nav";
import { RoutineIconTile } from "@/components/routines/routine-icon";
import { db } from "@/lib/db/schema";
import { type DprContext, dprBadge } from "@/lib/dpr/calls";
import { useGyms } from "@/lib/gyms/use-gyms";
import { useInjuries, useTodayKey } from "@/lib/injuries/use-injuries";
import { buildPreWorkoutRows, visiblePreWorkoutRows } from "@/lib/workout/pre-workout-preview";
import {
  DEFAULT_SESSION_INTENSITY,
  SESSION_INTENSITIES,
  SESSION_INTENSITY_LABELS,
  type SessionIntensity,
  isInjuryOpenOn,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";

interface Props {
  /** For the exercise card a row's name opens (issue #796). */
  userId: string;
  /** Null for users without DPR: no targets or intensity pick (issue #282). */
  context: DprContext | null;
  routineId: string;
  routineName: string;
  starting: boolean;
  /**
   * Null intensity without DPR: the session records no intensity pick. Gym is
   * the picked gym's id (issue #454), null for none.
   */
  onStart: (intensity: SessionIntensity | null, gymId: string | null) => void;
  onCancel: () => void;
}

const INTENSITY_ICONS: Record<SessionIntensity, IconComponent> = {
  light: Feather,
  maintain: ArrowRight,
  push: ArrowUp,
};

function formatWeight(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/**
 * Pre-workout sheet (issue #235): the routine's exercises and a Start button.
 * DPR users also get today's targets and "How hard do you want to push
 * today?" — Go light / Maintain / Push — with the targets following the pick
 * before the workout starts. Without DPR it's a plain preview (issue #282).
 * Users with gyms pick where they're training, home gym first (issue #454).
 * With an injury open, it hosts today's pain check-in (issue #627).
 *
 * Laid out as a launch pad (#856): a bottom sheet with one-line exercise rows
 * (five and "N more" past six), the gym as a chip, the effort pick as a
 * segmented control and a single Start; the corner X closes it.
 */
export function PreWorkoutSheet({
  userId,
  context,
  routineId,
  routineName,
  starting,
  onStart,
  onCancel,
}: Props) {
  const [intensity, setIntensity] = useState<SessionIntensity>(DEFAULT_SESSION_INTENSITY);
  const [showAll, setShowAll] = useState(false);
  const gyms = useGyms();
  const injuryData = useInjuries();
  const today = useTodayKey();
  const openInjuries = (injuryData?.injuries ?? []).filter((injury) =>
    isInjuryOpenOn(injury, today),
  );
  // Undefined until the user picks: follows the home gym as gyms load.
  const [pickedGymId, setPickedGymId] = useState<string | null | undefined>(undefined);
  const gymId =
    pickedGymId === undefined
      ? (gyms?.[0]?.id ?? null)
      : gyms?.some((gym) => gym.id === pickedGymId)
        ? pickedGymId
        : null;
  const routine = useLiveQuery(() => db.routines.get(routineId), [routineId]);
  const items = useLiveQuery(
    () => db.routineExercises.where("routineId").equals(routineId).toArray(),
    [routineId],
  );
  // DPR's context already carries every exercise; without it, look up just
  // this routine's.
  const exercises = useLiveQuery(async () => {
    if (context || !items) return undefined;
    const rows = await db.exercises.bulkGet(items.map((item) => item.exerciseId));
    return new Map(rows.flatMap((row) => (row ? [[row.id, row] as const] : [])));
  }, [context, items]);
  const rows = useMemo(
    () => buildPreWorkoutRows(context, items ?? [], intensity, context?.exercises ?? exercises),
    [context, items, intensity, exercises],
  );
  const units = context?.settings.units;

  const { shown: shownRows, hidden: hiddenRows } = visiblePreWorkoutRows(rows, showAll);
  const gymName =
    gymId === null ? "No gym" : (gyms?.find((gym) => gym.id === gymId)?.name ?? "No gym");

  return (
    <FloatingCard
      labelledBy="pre-workout-title"
      onClose={onCancel}
      tint={routine?.iconColor}
      anchor="bottom"
    >
      {(requestClose) => (
        <>
          <div className="flex touch-none items-start gap-3 px-[18px] pt-5">
            {routine && (
              <RoutineIconTile shape={routine.iconShape} color={routine.iconColor} size="lg" />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h2
                id="pre-workout-title"
                className="truncate text-2xl leading-tight font-bold tracking-[-0.025em]"
              >
                {routineName}
              </h2>
              <div className="flex min-w-0 items-center gap-2 text-[15px] text-zinc-500 dark:text-zinc-400">
                <span className="shrink-0 tabular-nums">
                  {rows.length} exercise{rows.length === 1 ? "" : "s"}
                </span>
                {gyms && gyms.length > 0 && (
                  <span className="relative flex h-7 min-w-0 items-center gap-1 rounded-full bg-zinc-900/[0.06] pr-2 pl-1.5 text-sm font-medium text-zinc-950 dark:bg-white/[0.1] dark:text-zinc-50">
                    <MapPin
                      className="h-[15px] w-[15px] shrink-0 text-zinc-500"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 truncate">{gymName}</span>
                    <ChevronDown
                      className="h-3 w-3 shrink-0 text-zinc-400"
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                    {/* The native picker, laid invisibly over the chip. */}
                    <select
                      aria-label="Gym"
                      value={gymId ?? ""}
                      onChange={(event) => setPickedGymId(event.target.value || null)}
                      // 44px tall hit area around the 28px chip (docs/PWA.md §7).
                      className="absolute -inset-y-2 inset-x-0 min-w-0 cursor-pointer opacity-0"
                    >
                      {gyms.map((gym) => (
                        <option key={gym.id} value={gym.id}>
                          {gym.name}
                        </option>
                      ))}
                      <option value="">No gym</option>
                    </select>
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={requestClose}
              className="press -m-[5px] flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            >
              <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-zinc-900/[0.07] text-zinc-500 dark:bg-white/[0.12] dark:text-zinc-400">
                <X className="h-[17px] w-[17px]" aria-hidden="true" />
              </span>
            </button>
          </div>

          <div className="mx-[18px] mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] bg-zinc-100 dark:bg-zinc-800">
            <ul className="allow-pwa-select flex min-h-0 flex-1 flex-col divide-y divide-zinc-900/[0.08] overflow-y-auto overscroll-contain pl-3.5 dark:divide-white/[0.1]">
              {shownRows.map((row) => {
                const weight = row.dpr?.decision.weight ?? null;
                return (
                  <li
                    key={row.id}
                    className="flex min-h-[42px] shrink-0 items-center justify-between gap-2.5 pr-3.5 text-base"
                  >
                    <ExerciseNameButton
                      exerciseId={row.exerciseId}
                      userId={userId}
                      className="truncate font-medium"
                    >
                      {row.name}
                    </ExerciseNameButton>
                    {row.dpr && weight !== null ? (
                      <span
                        aria-label={`${dprBadge(row.dpr.decision.call).label}, ${formatWeight(weight)} ${units}`}
                        className="flex shrink-0 items-center gap-1.5 text-[15px] tabular-nums"
                      >
                        <CallMark call={row.dpr.decision.call} className="text-xs" />
                        <span>
                          <span className="font-semibold">{formatWeight(weight)}</span>{" "}
                          <span className="text-zinc-500 dark:text-zinc-400">{units}</span>
                        </span>
                      </span>
                    ) : (
                      row.plan && (
                        <span className="shrink-0 text-[15px] text-zinc-500 tabular-nums dark:text-zinc-400">
                          {row.plan}
                        </span>
                      )
                    )}
                  </li>
                );
              })}
              {hiddenRows > 0 && (
                <li className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowAll(true)}
                    className="flex min-h-[42px] w-full items-center justify-between pr-3.5 text-left text-base text-zinc-500 dark:text-zinc-400"
                  >
                    {hiddenRows} more
                    <ChevronDown className="h-4 w-4 text-zinc-400" aria-hidden="true" />
                  </button>
                </li>
              )}
            </ul>
          </div>

          {injuryData && openInjuries.length > 0 && (
            <div className="max-h-[40lvh] shrink-0 overflow-y-auto overscroll-contain px-[18px] pt-[18px] pb-1">
              <PainCheckin injuries={openInjuries} checkins={injuryData.checkins} today={today} />
            </div>
          )}

          <div className="flex touch-none flex-col gap-5 px-[18px] pt-[18px] pb-[18px]">
            {context && (
              <fieldset className={SEGMENTED_TRACK}>
                <legend className="sr-only">How hard do you want to push today?</legend>
                {SESSION_INTENSITIES.map((option) => {
                  const Icon = INTENSITY_ICONS[option];
                  const active = intensity === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setIntensity(option)}
                      className={`gap-1.5 ${segmentClass(active)}`}
                    >
                      <Icon
                        className={`h-4 w-4 shrink-0 ${active ? "" : "text-zinc-500 dark:text-zinc-400"}`}
                        aria-hidden="true"
                      />
                      {SESSION_INTENSITY_LABELS[option]}
                    </button>
                  );
                })}
              </fieldset>
            )}
            <button
              type="button"
              onClick={() => onStart(context ? intensity : null, gymId)}
              disabled={starting}
              className="tinted-action press flex min-h-14 items-center justify-center gap-2 rounded-full bg-accent px-4 text-[17px] font-semibold text-accent-foreground disabled:opacity-50"
            >
              <Play className="h-[18px] w-[18px]" fill="currentColor" aria-hidden="true" />
              Start workout
            </button>
          </div>
        </>
      )}
    </FloatingCard>
  );
}
