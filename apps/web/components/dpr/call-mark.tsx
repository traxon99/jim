import { dprBadge } from "@/lib/dpr/calls";
import type { DprCall } from "@jim/core";
import {
  ArrowDown,
  ArrowDownRight,
  ArrowRight,
  ArrowUp,
  CircleHelp,
  Feather,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<DprCall, LucideIcon> = {
  increase: ArrowUp,
  hold: ArrowRight,
  deload: ArrowDown,
  reenter: ArrowDownRight,
  light: Feather,
  insufficient: CircleHelp,
};

/**
 * A PRP call as its word mark: bold caps and an arrow in the call's color,
 * e.g. a green "UP ↑" or "STAY →". Reads as one word, so it can sit inside
 * a sentence ("Go UP ↑") or a pill; it takes its color from the call unless
 * `inherit` leaves it to the pill around it.
 */
export function CallMark({
  call,
  inherit = false,
  className = "",
}: {
  call: DprCall;
  inherit?: boolean;
  className?: string;
}) {
  const badge = dprBadge(call);
  const Icon = ICONS[call];
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-extrabold tracking-wide whitespace-nowrap ${inherit ? "" : badge.textClassName} ${className}`}
    >
      {badge.word}
      <Icon className="h-[1em] w-[1em] shrink-0" strokeWidth={3} aria-hidden="true" />
    </span>
  );
}

/** A routine's calls as marks with counts, e.g. "UP ↑ 2  STAY → 1". */
export function CallMarkCounts({ counts }: { counts: { call: DprCall; count: number }[] }) {
  return (
    <span className="inline-flex items-center gap-2">
      {counts.map(({ call, count }) => (
        <span key={call} className="inline-flex items-center gap-0.5">
          <CallMark call={call} />
          <span className="text-zinc-600 tabular-nums dark:text-zinc-400">{count}</span>
        </span>
      ))}
    </span>
  );
}
