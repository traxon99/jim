import type { WeekDay } from "@/lib/home/stats";
import type { ReactNode } from "react";

/**
 * A week-progress ring around the profile avatar (issues #751/#752), using
 * the same trained-day data as Home's week row.
 */
export function ProfileWeekRing({
  days,
  children,
}: {
  days: readonly WeekDay[];
  children: ReactNode;
}) {
  const trained = days.filter((day) => day.trained).length;
  const total = days.length || 7;
  const progress = total > 0 ? trained / total : 0;
  const radius = 36;
  const stroke = 3;
  const normalized = 2 * Math.PI * radius;
  const dash = normalized * progress;

  return (
    <div className="relative h-[4.75rem] w-[4.75rem] shrink-0">
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
        viewBox="0 0 80 80"
        aria-hidden="true"
      >
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          className="stroke-zinc-200 dark:stroke-zinc-800"
          strokeWidth={stroke}
        />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          className="stroke-zinc-950 dark:stroke-zinc-50"
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${normalized - dash}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-[6px] flex items-center justify-center">{children}</div>
    </div>
  );
}
