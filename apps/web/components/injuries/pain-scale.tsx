"use client";

import { PAIN_LEVELS, PAIN_MAX, PAIN_MIN, painAtFraction, painLabel } from "@jim/core";
import { type KeyboardEvent, type PointerEvent, type ReactNode, useRef, useState } from "react";

/** One color per level, green at 0 through amber to red at 10 (#856). */
const PAIN_COLORS = [
  "#34c759",
  "#5cc94c",
  "#8fcb3f",
  "#bfc934",
  "#e3bf2a",
  "#f5a623",
  "#f78c1f",
  "#f4701f",
  "#ef5524",
  "#e8392b",
  "#dc2433",
] as const;

export function painColor(level: number): string {
  return PAIN_COLORS[Math.min(PAIN_MAX, Math.max(PAIN_MIN, level))] ?? PAIN_COLORS[0];
}

/**
 * Pain level 0–10 (issue #627) as one row of eleven segments (#856): tap a
 * segment or drag along the row, and it logs once when the finger lifts. The
 * row fills up to the level in that level's color, and the header line shows
 * the level and its word ("2 Minor"). Keyboard: arrows step, Home/End jump.
 */
export function PainScale({
  value,
  onChange,
  label,
  title,
}: {
  value: number | null;
  onChange: (level: number) => void;
  /** Read out for the slider, e.g. "Left knee pain today". */
  label: string;
  /** Left side of the header line, e.g. the injury's icon and name. */
  title?: ReactNode;
}) {
  // The level under the finger while dragging; committed on release.
  const [pending, setPending] = useState<number | null>(null);
  const dragging = useRef(false);
  const shown = pending ?? value;

  const levelAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return painAtFraction(rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setPending(levelAt(event));
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) setPending(levelAt(event));
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    const level = levelAt(event);
    setPending(null);
    if (level !== value) onChange(level);
  };
  // A vertical scroll that started on the row takes the gesture: log nothing.
  const onPointerCancel = () => {
    dragging.current = false;
    setPending(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const from = value ?? PAIN_MIN - 1;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = from + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = from - 1;
    else if (event.key === "Home") next = PAIN_MIN;
    else if (event.key === "End") next = PAIN_MAX;
    if (next === null) return;
    event.preventDefault();
    next = Math.min(PAIN_MAX, Math.max(PAIN_MIN, next));
    if (next !== value) onChange(next);
  };

  const color = shown === null ? null : painColor(shown);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-h-6 min-w-0 items-baseline justify-between gap-3 px-0.5">
        <span className="flex min-w-0 items-center gap-1.5 text-[15px] font-semibold">{title}</span>
        {shown !== null && (
          <span aria-hidden="true" className="shrink-0 text-[15px] text-zinc-500 tabular-nums">
            <span className="mr-1 text-[17px] font-bold text-zinc-950 dark:text-zinc-50">
              {shown}
            </span>
            {painLabel(shown)}
          </span>
        )}
      </div>
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={PAIN_MIN}
        aria-valuemax={PAIN_MAX}
        aria-valuenow={value ?? undefined}
        aria-valuetext={value === null ? "Not logged" : `${value}, ${painLabel(value)}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
        className="grid h-11 touch-pan-y select-none grid-cols-11 gap-[3px] rounded-xl outline-offset-4"
      >
        {PAIN_LEVELS.map((level) => {
          const filled = shown !== null && level <= shown;
          const current = level === shown;
          return (
            <span
              key={level}
              aria-hidden="true"
              className={`flex min-w-0 items-center justify-center rounded-[7px] text-[13px] tabular-nums first:rounded-l-xl last:rounded-r-xl ${
                filled
                  ? current
                    ? "font-extrabold text-white"
                    : "font-semibold text-white/90"
                  : "bg-zinc-900/[0.06] font-semibold text-zinc-500 dark:bg-white/[0.1] dark:text-zinc-400"
              }`}
              style={
                filled && color && shown !== null
                  ? {
                      backgroundColor: color,
                      opacity: current ? 1 : 0.35 + (0.65 * (level + 1)) / (shown + 1),
                      outline: current ? `1.5px solid ${color}` : undefined,
                      outlineOffset: current ? 2 : undefined,
                    }
                  : undefined
              }
            >
              {level}
            </span>
          );
        })}
      </div>
    </div>
  );
}
