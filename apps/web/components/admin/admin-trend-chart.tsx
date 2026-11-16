"use client";

import { useEffect, useRef, useState } from "react";

export type TrendTone = "primary" | "secondary";

export interface TrendSeries {
  id: string;
  label: string;
  values: number[];
  tone: TrendTone;
}

const TONE_CLASS: Record<TrendTone, string> = {
  primary: "text-zinc-900 dark:text-zinc-100",
  secondary: "text-zinc-400 dark:text-zinc-500",
};

const DAY_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function dayLabel(day: string): string {
  return DAY_LABEL.format(new Date(`${day}T00:00:00Z`));
}

/** A round top for the y axis: 1, 2 or 5 times a power of ten. */
export function niceMax(value: number): number {
  if (value <= 4) return 4;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((m) => m * power >= value / 4) ?? 10;
  return Math.ceil(value / (step * power)) * step * power;
}

const PAD = { top: 8, right: 8, bottom: 24, left: 32 };

/**
 * A daily trend for the admin Overview (issue #810): thin lines (or bars),
 * a recessive grid, a legend for two or more series, and a crosshair with a
 * tooltip on hover or touch.
 */
export function AdminTrendChart({
  days,
  series,
  kind = "line",
  height = 220,
  label,
}: {
  days: string[];
  series: TrendSeries[];
  kind?: "line" | "bar";
  height?: number;
  label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const top = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const plotWidth = Math.max(0, width - PAD.left - PAD.right);
  const plotHeight = height - PAD.top - PAD.bottom;
  const count = days.length;
  const step = count > 0 ? plotWidth / count : 0;
  // Lines run point to point; bars sit in the middle of each day's slot.
  const x = (i: number) =>
    PAD.left + (kind === "bar" ? step * (i + 0.5) : count > 1 ? (plotWidth * i) / (count - 1) : 0);
  const y = (value: number) => PAD.top + plotHeight - (value / top) * plotHeight;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(top * f));

  function pick(clientX: number) {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || count === 0) return;
    const local = clientX - rect.left - PAD.left;
    const index =
      kind === "bar"
        ? Math.floor(local / step)
        : Math.round(count > 1 ? (local / plotWidth) * (count - 1) : 0);
    setHover(Math.min(count - 1, Math.max(0, index)));
  }

  const hovered = hover === null ? null : days[hover];
  const tooltipLeft = hover === null ? 0 : Math.min(Math.max(x(hover), 70), width - 70);

  return (
    <div className="min-w-0">
      {series.length > 1 && (
        <ul className="mb-2 flex flex-wrap justify-end gap-x-4 gap-y-1 text-sm text-zinc-500">
          {series.map((s) => (
            <li key={s.id} className="flex items-center gap-1.5">
              <span
                className={`h-0.5 w-3 rounded-full bg-current ${TONE_CLASS[s.tone]}`}
                aria-hidden="true"
              />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div
        ref={box}
        className="relative touch-pan-y select-none"
        style={{ height }}
        onPointerMove={(event) => pick(event.clientX)}
        onPointerDown={(event) => pick(event.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={label}>
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(tick)}
                  y2={y(tick)}
                  className="stroke-zinc-200 dark:stroke-zinc-800"
                  strokeDasharray={tick === 0 ? undefined : "2 4"}
                />
                <text
                  x={PAD.left - 6}
                  y={y(tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-zinc-500 text-[11px] tabular-nums"
                >
                  {tick}
                </text>
              </g>
            ))}
            {count > 0 && (
              <>
                <text x={PAD.left} y={height - 6} className="fill-zinc-500 text-[11px]">
                  {dayLabel(days[0] as string)}
                </text>
                <text
                  x={width - PAD.right}
                  y={height - 6}
                  textAnchor="end"
                  className="fill-zinc-500 text-[11px]"
                >
                  {dayLabel(days[count - 1] as string)}
                </text>
              </>
            )}
            {hover !== null && kind === "line" && (
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={PAD.top}
                y2={PAD.top + plotHeight}
                className="stroke-zinc-300 dark:stroke-zinc-700"
              />
            )}
            {series.map((s) =>
              kind === "bar" ? (
                <g key={s.id} className={TONE_CLASS[s.tone]}>
                  {s.values.map((value, i) => {
                    const barWidth = Math.max(1, step - 2);
                    const h = Math.max(0, PAD.top + plotHeight - y(value));
                    return (
                      <rect
                        // biome-ignore lint/suspicious/noArrayIndexKey: one bar per day, in order
                        key={i}
                        x={x(i) - barWidth / 2}
                        y={y(value)}
                        width={barWidth}
                        height={h}
                        rx={Math.min(2, barWidth / 2)}
                        fill="currentColor"
                        opacity={hover === null || hover === i ? 1 : 0.45}
                      />
                    );
                  })}
                </g>
              ) : (
                <g key={s.id} className={TONE_CLASS[s.tone]}>
                  <polyline
                    points={s.values.map((value, i) => `${x(i)},${y(value)}`).join(" ")}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {hover !== null && (
                    <circle
                      cx={x(hover)}
                      cy={y(s.values[hover] ?? 0)}
                      r={4}
                      fill="currentColor"
                      className="stroke-white dark:stroke-zinc-900"
                      strokeWidth={2}
                    />
                  )}
                </g>
              ),
            )}
          </svg>
        )}
        {hover !== null && hovered && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            style={{ left: tooltipLeft }}
          >
            <p className="font-medium">{dayLabel(hovered)}</p>
            {series.map((s) => (
              <p
                key={s.id}
                className="flex items-center gap-1.5 whitespace-nowrap text-zinc-600 dark:text-zinc-400"
              >
                <span
                  className={`h-0.5 w-2.5 rounded-full bg-current ${TONE_CLASS[s.tone]}`}
                  aria-hidden="true"
                />
                {s.label}
                <span className="ml-auto pl-3 font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                  {s.values[hover] ?? 0}
                </span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
