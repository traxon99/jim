"use client";

import { normalizeDecimalInput } from "@jim/core";
import { useId } from "react";

interface Props {
  label: string;
  value: string;
  /** Typing: the raw field text. */
  onChange: (value: string) => void;
  /** Saves a value: on blur, Enter, or right after a − / + tap. */
  onCommit: (value: string) => void;
  step: number;
  min?: number;
  /** Decimal keypad and a decimal comma kept (#675); otherwise whole numbers. */
  decimal?: boolean;
  /** Shown faintly when empty, and what − / + step from. */
  placeholder?: string;
  /** A short unit after the number, e.g. "lb" or "s". */
  unit?: string;
}

/**
 * A number field with − / + beside it (#854). The field always takes typing,
 * so any value is one tap and a keypad away; the buttons are a shortcut for
 * the usual small change.
 */
export function NumberStepper({
  label,
  value,
  onChange,
  onCommit,
  step,
  min = 0,
  decimal = false,
  placeholder,
  unit,
}: Props) {
  const id = useId();

  function nudge(direction: 1 | -1) {
    const base = Number(value.trim() === "" ? (placeholder ?? "") : value);
    const start = Number.isFinite(base) ? base : 0;
    // Snap to the step so 187.5 + 5 lands on 192.5, and a stray 186 on 190.
    const snapped =
      direction === 1
        ? Math.floor(start / step + 1e-9) * step + step
        : Math.ceil(start / step - 1e-9) * step - step;
    const next = Math.max(min, Number(snapped.toFixed(2)));
    const text = String(next);
    onChange(text);
    onCommit(text);
  }

  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-2xl bg-zinc-100 py-1.5 pr-1.5 pl-3 dark:bg-zinc-800/70">
      <label htmlFor={id} className="truncate text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </label>
      <div className="flex min-w-0 items-center gap-1">
        <span className="flex min-w-0 flex-1 items-baseline gap-1">
          <input
            id={id}
            type="text"
            inputMode={decimal ? "decimal" : "numeric"}
            value={value}
            placeholder={placeholder ?? "—"}
            onChange={(event) =>
              onChange(
                decimal
                  ? normalizeDecimalInput(event.target.value)
                  : event.target.value.replace(/\D/g, ""),
              )
            }
            onBlur={() => onCommit(value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            className="w-full min-w-0 bg-transparent text-lg font-semibold tabular-nums text-zinc-950 outline-none placeholder:text-zinc-400 dark:text-zinc-50 dark:placeholder:text-zinc-600"
          />
          {unit && value !== "" && (
            <span className="shrink-0 text-sm text-zinc-500 dark:text-zinc-400">{unit}</span>
          )}
        </span>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => nudge(-1)}
            aria-label={`Less ${label.toLowerCase()}`}
            className="press flex h-11 w-11 items-center justify-center rounded-full bg-white text-xl text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => nudge(1)}
            aria-label={`More ${label.toLowerCase()}`}
            className="press flex h-11 w-11 items-center justify-center rounded-full bg-white text-xl text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
