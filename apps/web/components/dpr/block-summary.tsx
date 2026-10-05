"use client";

import type { DprBlockRow } from "@/lib/db/schema";
import { EXPERIENCE_LABELS, PRESET_LABELS, formatDate } from "./labels";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "Week 4 of 12" with the block's snapshot settings and its end date — the
 * effective one, pushed back by any layoffs (issue #214).
 */
export function BlockHeader({
  block,
  effectiveEnd,
  now,
}: {
  block: DprBlockRow;
  effectiveEnd: Date;
  now: Date;
}) {
  const elapsedWeeks = Math.floor((now.getTime() - block.startedAt.getTime()) / (7 * DAY_MS));
  const week = Math.min(block.weeks, Math.max(1, elapsedWeeks + 1));
  const shifted = effectiveEnd.getTime() - block.endsAt.getTime() >= DAY_MS;

  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {block.status === "deload" ? "Deload week" : `Week ${week} of ${block.weeks}`}
        </h2>
        <span className="text-xs text-zinc-500 dark:text-zinc-500">
          ends {formatDate(effectiveEnd)}
          {shifted && " (moved for time off)"}
        </span>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-500">
        {block.status === "deload"
          ? `Every focused lift is called 10% lighter this week${block.volumeMode ? ", with half the weekly sets" : ""}.`
          : `${PRESET_LABELS[block.aggressiveness]} · goals set for ${EXPERIENCE_LABELS[block.experience].toLowerCase()}`}
      </p>
    </section>
  );
}
