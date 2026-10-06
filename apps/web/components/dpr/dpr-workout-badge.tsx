"use client";

import { CallMark, CallMarkCounts } from "@/components/dpr/call-mark";
import { FloatingCard } from "@/components/floating-card";
import {
  type DprCallInfo,
  type DprContext,
  dprBadge,
  dprCallCounts,
  dprCallSummary,
  dprGoalLine,
  dprWhyLine,
} from "@/lib/dpr/calls";
import { useId, useState } from "react";

function formatWeight(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/**
 * One compact DPR badge for a routine on the Workout tab, e.g. "DPR ↑2 =1"
 * (issue #284). Tapping it opens a floating card with the call, why line and
 * block goal for each of the routine's focused lifts.
 */
export function DprWorkoutBadge({
  context,
  calls,
  routineName,
}: {
  context: DprContext;
  calls: readonly DprCallInfo[];
  routineName: string;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  if (calls.length === 0) return null;

  const units = context.settings.units;
  const summary = dprCallSummary(calls);
  const blockEnds = context.block.endsAt.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`PRP details for ${routineName}: ${summary}`}
        className="flex w-fit shrink-0 items-center gap-1.5 rounded-full border border-accent px-2 py-0.5 text-xs font-medium"
      >
        <span className="font-semibold">PRP</span>
        <CallMarkCounts counts={dprCallCounts(calls)} />
      </button>

      {open && (
        <FloatingCard labelledBy={titleId} onClose={() => setOpen(false)}>
          {(close) => (
            <>
              <div className="flex touch-none flex-col gap-1 px-4 pt-4">
                <h2 id={titleId} className="truncate text-lg font-semibold">
                  PRP · {routineName}
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-500">
                  {calls.length} focused lift{calls.length === 1 ? "" : "s"} · block ends{" "}
                  {blockEnds}
                </p>
              </div>

              <ul className="allow-pwa-select mt-2 flex min-h-0 flex-1 flex-col divide-y divide-zinc-200 overflow-y-auto overscroll-contain px-4 dark:divide-zinc-800">
                {calls.map((info) => {
                  const name = context.exercises.get(info.exerciseId)?.name ?? "Lift";
                  const badge = dprBadge(info.decision.call);
                  const { weight } = info.decision;
                  const goal = dprGoalLine(context, info.exerciseId);
                  return (
                    <li key={info.exerciseId} className="flex flex-col gap-1 py-3 text-sm">
                      <span className="flex items-center justify-between gap-3">
                        <span className="truncate font-medium">{name}</span>
                        <span
                          aria-label={
                            weight === null
                              ? badge.label
                              : `${badge.label}, ${formatWeight(weight)} ${units}`
                          }
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${badge.className}`}
                        >
                          <span className="flex items-center gap-1">
                            <CallMark call={info.decision.call} inherit />
                            {weight !== null && `${formatWeight(weight)} ${units}`}
                          </span>
                        </span>
                      </span>
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">
                        {dprWhyLine(info.decision, units)}
                      </span>
                      {goal && (
                        <span className="text-xs text-zinc-500 dark:text-zinc-500">
                          Goal: {goal.text}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>

              <div className="flex touch-none border-t border-zinc-200 px-4 pt-3 pb-4 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={close}
                  className="min-h-11 flex-1 rounded-lg border border-zinc-300 px-4 text-base font-medium dark:border-zinc-700"
                >
                  Done
                </button>
              </div>
            </>
          )}
        </FloatingCard>
      )}
    </>
  );
}
