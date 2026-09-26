"use client";

import type { DprBlockLiftRow, DprBlockRow, ExerciseRow } from "@/lib/db/schema";
import { EXPERIENCE_LABELS, PRESET_LABELS, formatDate, formatWeight } from "./labels";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The running block at a glance: week, snapshot settings, and each lift's goal. */
export function BlockSummary({
  block,
  lifts,
  exercises,
  units,
}: {
  block: DprBlockRow;
  lifts: readonly DprBlockLiftRow[];
  exercises: readonly ExerciseRow[];
  units: string;
}) {
  const namesById = new Map(exercises.map((exercise) => [exercise.id, exercise.name]));
  const elapsedWeeks = Math.floor((Date.now() - block.startedAt.getTime()) / (7 * DAY_MS));
  const week = Math.min(block.weeks, Math.max(1, elapsedWeeks + 1));

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-zinc-300 px-4 py-3 dark:border-zinc-700">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">
          {block.status === "deload" ? "Deload week" : `Week ${week} of ${block.weeks}`}
        </h2>
        <span className="text-xs text-zinc-500 dark:text-zinc-500">
          ends {formatDate(block.endsAt)}
        </span>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-500">
        Goals set for {EXPERIENCE_LABELS[block.experience].toLowerCase()} ·{" "}
        {PRESET_LABELS[block.aggressiveness].toLowerCase()}
      </p>
      <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
        {lifts.map((lift) => (
          <li key={lift.id} className="flex items-baseline justify-between gap-2 py-2">
            <span className="min-w-0 truncate text-sm font-medium">
              {namesById.get(lift.exerciseId) ?? "Exercise"}
            </span>
            <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-500">
              {lift.goalE1rm === null
                ? "Add RPE to set a goal"
                : `e1RM ${formatWeight(Number(lift.baselineE1rm), units)} → ${formatWeight(Number(lift.goalE1rm), units)}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
