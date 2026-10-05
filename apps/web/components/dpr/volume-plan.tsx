"use client";

import type { DprContext } from "@/lib/dpr/calls";
import { type MuscleVolumePlan, VOLUME_STEP_SETS, type VolumeWeekCall } from "@jim/core";

const CALL_TEXT: Record<VolumeWeekCall, string> = {
  start: "starting point",
  add: `+${VOLUME_STEP_SETS} after a good week`,
  hold: "held: hard week or sets skipped",
  drop: `−${VOLUME_STEP_SETS} after missed reps`,
  max: "at its most",
  deload: "deload: half the sets",
};

const CALL_SYMBOL: Record<VolumeWeekCall, string> = {
  start: "",
  add: "↑",
  hold: "=",
  drop: "↓",
  max: "=",
  deload: "↓",
};

function formatSets(n: number): string {
  return String(Math.round(n * 10) / 10);
}

function MuscleRow({ plan }: { plan: MuscleVolumePlan }) {
  const { current } = plan;
  const percent = current.planned > 0 ? Math.min(100, (current.actual / current.planned) * 100) : 0;
  const done = current.actual >= current.planned;
  return (
    <li className="flex flex-col gap-1">
      <details className="text-sm">
        <summary className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 py-1">
          <span className="w-24 shrink-0 truncate text-xs capitalize text-zinc-600 dark:text-zinc-400">
            {plan.muscle}
          </span>
          <div className="relative h-2 min-w-0 flex-1 rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className={`h-2 rounded-full ${done ? "bg-emerald-500 dark:bg-emerald-400" : "bg-accent"}`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="w-20 shrink-0 text-right text-xs tabular-nums">
            {formatSets(current.actual)} / {formatSets(current.planned)}
            {CALL_SYMBOL[current.call] && (
              <span className="text-zinc-500 dark:text-zinc-500"> {CALL_SYMBOL[current.call]}</span>
            )}
          </span>
        </summary>
        <ol className="flex flex-col gap-0.5 pb-2 text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
          {plan.weeks.map((week) => (
            <li key={week.week} className="min-w-0">
              {week.call === "deload" ? "Deload" : `Week ${week.week}`} · {formatSets(week.actual)}{" "}
              of {formatSets(week.planned)} sets · {CALL_TEXT[week.call]}
            </li>
          ))}
        </ol>
      </details>
    </li>
  );
}

/**
 * Mesocycle mode on /progression (issue #250): planned vs actual weekly
 * sets per muscle, and the switch that turns the mode on or off.
 */
export function VolumePlan({
  context,
  busy,
  onToggle,
}: {
  context: DprContext;
  busy: boolean;
  onToggle: (on: boolean) => void;
}) {
  const plans = context.volume ? [...context.volume.values()] : null;

  if (!plans) {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-zinc-300 px-4 py-3 dark:border-zinc-700">
        <h2 className="text-base font-semibold">Grow weekly sets</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Mesocycle mode adds sets for each muscle week over week, holds or drops them after hard
          weeks, and halves them in the deload week. Your routines' set counts are adjusted in the
          workout.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => onToggle(true)}
          className="min-h-11 rounded-lg border border-zinc-300 px-4 text-sm font-medium disabled:opacity-50 dark:border-zinc-700"
        >
          Turn on
        </button>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-zinc-300 px-4 py-3 dark:border-zinc-700">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Weekly sets</h2>
        <span className="text-xs text-zinc-500 dark:text-zinc-500">done / planned</span>
      </div>
      {plans.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          Your first week of training sets each muscle's starting point.
        </p>
      ) : (
        <ul className="flex flex-col">
          {plans.map((plan) => (
            <MuscleRow key={plan.muscle} plan={plan} />
          ))}
        </ul>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => onToggle(false)}
        className="min-h-11 self-start text-sm font-medium text-zinc-600 disabled:opacity-50 dark:text-zinc-400"
      >
        Turn off mesocycle mode
      </button>
    </section>
  );
}
