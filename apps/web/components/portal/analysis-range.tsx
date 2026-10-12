"use client";

import { parseAnalysisRange } from "@/lib/portal/sections";
import { ANALYSIS_RANGES, type AnalysisRange, DEFAULT_ANALYSIS_RANGE } from "@jim/core";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * The Analysis time range, kept in `?range=` (issue #470) so it carries
 * across sections and survives a reload. Read from the router, never
 * `window.location` (LESSONS #444).
 */
export function useAnalysisRange(): [AnalysisRange, (range: AnalysisRange) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const range = parseAnalysisRange(searchParams.get("range"));

  function setRange(next: AnalysisRange) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === DEFAULT_ANALYSIS_RANGE) params.delete("range");
    else params.set("range", next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return [range, setRange];
}

export function AnalysisRangePicker({
  range,
  onChange,
}: {
  range: AnalysisRange;
  onChange: (range: AnalysisRange) => void;
}) {
  return (
    <fieldset className="flex flex-wrap gap-1 rounded-lg border border-zinc-200 p-1 dark:border-zinc-800">
      <legend className="sr-only">Time range</legend>
      {ANALYSIS_RANGES.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={range === option.id}
          onClick={() => onChange(option.id)}
          className={`min-h-9 rounded-md px-3 text-sm font-medium ${
            range === option.id
              ? "bg-accent text-accent-foreground"
              : "text-zinc-600 dark:text-zinc-400"
          }`}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}

/** A section's title row, with the range picker on the right when the section uses one. */
export function PortalSectionHeader({
  title,
  range,
  onRangeChange,
}: {
  title: string;
  range?: AnalysisRange;
  onRangeChange?: (range: AnalysisRange) => void;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {range && onRangeChange && <AnalysisRangePicker range={range} onChange={onRangeChange} />}
    </header>
  );
}
