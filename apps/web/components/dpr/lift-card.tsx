"use client";

import type { DprBlockLiftRow } from "@/lib/db/schema";
import {
  type DprContext,
  dprBadge,
  dprCallFor,
  dprUserSettings,
  dprWhyLine,
  formatLogEntry,
  liftGoal,
} from "@/lib/dpr/calls";
import { e1rmSeries, liftDecisionLog, liftProgress } from "@jim/core";
import { GoalChart } from "./goal-chart";
import { formatWeight } from "./labels";
import { StatusPill } from "./status-pill";

const LOG_LIMIT = 12;

/** One focused lift on /progression (issue #214): progress, next call, chart, log. */
export function LiftCard({ context, lift }: { context: DprContext; lift: DprBlockLiftRow }) {
  const exercise = context.exercises.get(lift.exerciseId);
  const units = context.settings.units;
  const goal = liftGoal(lift);
  const progress = liftProgress(
    context.snapshot,
    lift.exerciseId,
    context.block,
    goal,
    context.now,
  );
  const call = dprCallFor(context, lift.exerciseId);
  const series = e1rmSeries(context.snapshot.history, lift.exerciseId).filter(
    (p) => p.date >= new Date(context.block.startedAt.getTime() - 28 * 24 * 60 * 60 * 1000),
  );
  const log = liftDecisionLog({
    snapshot: context.snapshot,
    exerciseId: lift.exerciseId,
    equipment: exercise?.equipment,
    settings: dprUserSettings(context.settings),
    now: context.now,
  }).filter((entry) => entry.sessionDate >= context.block.startedAt);

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-zinc-300 px-4 py-3 dark:border-zinc-700">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-base font-semibold">{exercise?.name ?? "Exercise"}</h3>
        {progress.status && <StatusPill status={progress.status} />}
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <div>
          <dt className="text-xs text-zinc-500 dark:text-zinc-500">e1RM now</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {formatWeight(progress.currentE1rm, units)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500 dark:text-zinc-500">Goal</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {formatWeight(goal.goalE1rm, units)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500 dark:text-zinc-500">Next</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {call && call.decision.weight !== null
              ? `${dprBadge(call.decision.call).symbol} ${Math.round(call.decision.weight * 100) / 100}`
              : "?"}
          </dd>
        </div>
      </dl>

      {call && (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          {dprWhyLine(call.decision, units)}
        </p>
      )}

      <GoalChart series={series} block={context.block} goal={goal} units={units} />

      <details className="text-sm">
        <summary className="min-h-11 cursor-pointer py-2 font-medium">
          Decision log ({log.length})
        </summary>
        {log.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-500">No sessions in this block yet.</p>
        ) : (
          <ol className="flex flex-col gap-1 text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
            {log.slice(0, LOG_LIMIT).map((entry) => (
              <li
                key={`${entry.sessionDate.getTime()}-${entry.repRange.low}-${entry.repRange.high}`}
              >
                {formatLogEntry(entry)}
              </li>
            ))}
          </ol>
        )}
      </details>
    </section>
  );
}
