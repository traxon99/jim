"use client";

import type { DprContext } from "@/lib/dpr/calls";
import { blockHasEnded } from "@jim/core";
import { Flag } from "lucide-react";
import Link from "next/link";

/**
 * Workout tab nudge when a block needs wrapping up (issue #215): it's past
 * its end and waiting on the recap, or its deload week is over. Gone once
 * the lifter acts on /progression.
 */
export function BlockEndCard({ context }: { context: DprContext | null }) {
  if (!context) return null;
  const { block, snapshot, now } = context;
  const liftIds = [...context.lifts.keys()];
  const ended = blockHasEnded(block, snapshot, liftIds, now);
  const deloadDone = block.status === "deload" && now >= block.endsAt;
  if (!ended && !deloadDone) return null;

  return (
    <Link
      href="/progression"
      data-ripple
      className="flex items-center gap-3 rounded-lg border border-accent px-4 py-3"
    >
      <Flag className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span className="flex flex-col gap-0.5">
        <span className="text-base font-semibold">
          {ended ? "Your training block is done" : "Deload week's over"}
        </span>
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          {ended ? "See how each lift went and plan the next block." : "Start your next block."}
        </span>
      </span>
    </Link>
  );
}
