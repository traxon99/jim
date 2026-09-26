"use client";

import type { DprBlockRow, ExerciseRow } from "@/lib/db/schema";
import type { DprBlockRecapSummary, DprLiftRecap } from "@jim/core";
import { CircleCheck, CircleX } from "lucide-react";
import { formatDate, formatWeight } from "./labels";

function pct(change: number | null): string {
  if (change === null) return "—";
  const value = Math.round(change * 1000) / 10;
  return `${value >= 0 ? "+" : ""}${value}%`;
}

/** Block-end recap (issue #215): baseline → final e1RM per lift, goal hit, best set. */
export function BlockRecap({
  block,
  recaps,
  summary,
  exercises,
  units,
  onDeload,
  onNextBlock,
  busy,
}: {
  block: DprBlockRow;
  recaps: readonly DprLiftRecap[];
  summary: DprBlockRecapSummary;
  exercises: ReadonlyMap<string, ExerciseRow>;
  units: string;
  onDeload: () => void;
  onNextBlock: () => void;
  busy: boolean;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Block complete</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {block.weeks} weeks from {formatDate(block.startedAt)}
          {summary.goalsSet > 0 && ` · ${summary.goalsHit} of ${summary.goalsSet} goals hit`}
          {summary.averageChange !== null && ` · e1RM ${pct(summary.averageChange)} on average`}
        </p>
      </div>

      <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
        {recaps.map((recap) => (
          <li key={recap.exerciseId} className="flex flex-col gap-1 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-base font-medium">
                {exercises.get(recap.exerciseId)?.name ?? "Exercise"}
              </span>
              {recap.hitGoal !== null && (
                <span className="flex shrink-0 items-center gap-1 text-xs font-medium">
                  {recap.hitGoal ? (
                    <CircleCheck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  ) : (
                    <CircleX className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  )}
                  {recap.hitGoal ? "Goal hit" : "Goal missed"}
                </span>
              )}
            </div>
            <span className="text-sm tabular-nums">
              e1RM {formatWeight(recap.baselineE1rm, units)} →{" "}
              {formatWeight(recap.finalE1rm, units)}{" "}
              <span className="text-zinc-500 dark:text-zinc-500">({pct(recap.change)})</span>
              {recap.goalE1rm !== null && (
                <span className="text-zinc-500 dark:text-zinc-500">
                  {" "}
                  · goal {formatWeight(recap.goalE1rm, units)}
                </span>
              )}
            </span>
            {recap.bestSet && (
              <span className="text-xs text-zinc-500 dark:text-zinc-500">
                Best set: {recap.bestSet.weight} × {recap.bestSet.reps}
                {recap.bestSet.rpe !== null && ` @ RPE ${recap.bestSet.rpe}`} on{" "}
                {formatDate(recap.bestSet.date)}
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onDeload}
          className="min-h-11 rounded-lg border border-zinc-300 px-4 text-sm font-medium disabled:opacity-50 dark:border-zinc-700"
        >
          Take a deload week first
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onNextBlock}
          className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-50"
        >
          Start next block
        </button>
      </div>
    </section>
  );
}
