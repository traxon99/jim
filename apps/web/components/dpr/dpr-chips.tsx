"use client";

import {
  type DprCallInfo,
  type DprContext,
  dprBadge,
  dprChipText,
  dprGoalLine,
  dprWhyLine,
  splitChips,
} from "@/lib/dpr/calls";
import { useState } from "react";

/**
 * Today's focused lifts and DPR's call for each (issue #213), e.g.
 * "Bench ↑ 190". Tapping a chip shows the why line and goal status. With
 * `max`, the row stays on one line and folds the rest into "+N more".
 */
export function DprChips({
  context,
  calls,
  max,
}: {
  context: DprContext;
  calls: readonly DprCallInfo[];
  max?: number;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (calls.length === 0) return null;

  const { shown, more } = max === undefined ? { shown: calls, more: 0 } : splitChips(calls, max);
  const open = calls.find((info) => info.exerciseId === openId) ?? null;
  const goal = open ? dprGoalLine(context, open.exerciseId) : null;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <ul
        aria-label="DPR focus"
        className={`flex min-w-0 gap-1.5 ${max === undefined ? "flex-wrap" : "flex-nowrap overflow-hidden"}`}
      >
        {shown.map((info) => {
          const name = context.exercises.get(info.exerciseId)?.name ?? "Lift";
          const badge = dprBadge(info.decision.call);
          return (
            <li key={info.exerciseId} className="min-w-0 shrink">
              <button
                type="button"
                aria-expanded={openId === info.exerciseId}
                aria-label={`${name}: ${badge.label}`}
                onClick={() => setOpenId(openId === info.exerciseId ? null : info.exerciseId)}
                className={`block max-w-40 truncate rounded-full border px-2 py-0.5 text-xs font-medium ${badge.className}`}
              >
                {dprChipText(name, info.decision)}
              </button>
            </li>
          );
        })}
        {more > 0 && (
          <li className="shrink-0 self-center text-xs text-zinc-500 dark:text-zinc-500">
            +{more} more
          </li>
        )}
      </ul>
      {open && (
        <output className="flex flex-col gap-0.5 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          <span>{dprWhyLine(open.decision, context.settings.units)}</span>
          {goal && <span>{goal.text}</span>}
        </output>
      )}
    </div>
  );
}
