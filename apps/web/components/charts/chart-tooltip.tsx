import { tooltipAlign } from "@/lib/charts/chart-hover";
import type { ReactNode } from "react";

/**
 * The hover card over a chart point (issue #468). Positioned in percent of
 * its `relative` chart wrapper, so it tracks the point at any chart width.
 * Opens away from the nearest side edge, and below the point when the point
 * sits near the top, so it never grows the page's scroll bounds
 * (docs/PWA.md §3). `max-w-48` keeps a centered card inside the chart:
 * centering only happens between 30% and 70% across (`tooltipAlign`).
 */
export function ChartTooltip({
  xFraction,
  yFraction,
  children,
}: {
  xFraction: number;
  yFraction: number;
  children: ReactNode;
}) {
  const align = tooltipAlign(xFraction);
  const translateX = align === "left" ? "0" : align === "right" ? "-100%" : "-50%";
  const translateY = yFraction < 0.35 ? "12px" : "calc(-100% - 12px)";
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-10 flex w-max max-w-48 flex-col gap-0.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-900 shadow-lg dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
      style={{
        left: `${xFraction * 100}%`,
        top: `${yFraction * 100}%`,
        transform: `translate(${translateX}, ${translateY})`,
      }}
    >
      {children}
    </div>
  );
}

/** "Mon, Mar 2, 2026": the date line every chart tooltip leads with. */
export function formatTooltipDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
