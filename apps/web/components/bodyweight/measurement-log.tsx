"use client";

import { UndoBar } from "@/components/undo-bar";
import { Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";

/**
 * The pieces Bodyweight and Measurements share (#551): the chart range
 * picker, the log form and the history list, so a fix lands on both.
 */

export const MEASUREMENT_INPUT_CLASS =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

/** How many entries the history list shows before "Show all". */
const HISTORY_PREVIEW = 20;

export function localDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatMeasurement(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function formatMeasurementChange(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return "±0";
  return `${rounded > 0 ? "+" : "−"}${formatMeasurement(Math.abs(rounded))}`;
}

export function RangePicker<K extends string>({
  ranges,
  value,
  onChange,
}: {
  ranges: readonly { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <fieldset className="flex gap-1" aria-label="Chart range">
      {ranges.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={value === option.key}
          onClick={() => onChange(option.key)}
          className={`flex min-h-11 flex-1 items-center justify-center rounded-lg text-sm font-medium ${
            value === option.key
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

export function LogEntryForm({
  heading,
  valueLabel,
  value,
  onValueChange,
  date,
  onDateChange,
  saving,
  error,
  submitLabel,
  onSubmit,
  children,
}: {
  heading: string;
  valueLabel: string;
  value: string;
  onValueChange: (value: string) => void;
  date: string;
  onDateChange: (date: string) => void;
  saving: boolean;
  error: string | null;
  submitLabel: string;
  onSubmit: () => void;
  /** Extra lines under the form. */
  children?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
        {heading}
      </h2>
      <div className="flex gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium">
          {valueLabel}
          <input
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSubmit();
            }}
            className={MEASUREMENT_INPUT_CLASS}
          />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium">
          Date
          <input
            type="date"
            value={date}
            max={localDateInput(new Date())}
            onChange={(event) => onDateChange(event.target.value)}
            className={MEASUREMENT_INPUT_CLASS}
          />
        </label>
      </div>
      <button
        type="button"
        onClick={onSubmit}
        disabled={saving || value.trim() === ""}
        className="flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
      >
        {saving ? "Saving…" : submitLabel}
      </button>
      {error && <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{error}</p>}
      {children}
    </section>
  );
}

interface HistoryPoint {
  id: string;
  measuredAt: Date;
  value: number;
}

export function MeasurementHistory<P extends HistoryPoint>({
  points,
  formatValue,
  deleteLabel,
  onDelete,
  undoLabel,
  onUndo,
}: {
  /** Newest first. */
  points: readonly P[];
  formatValue: (point: P) => string;
  deleteLabel: (point: P) => string;
  onDelete: (id: string) => void;
  undoLabel: string | null;
  onUndo: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  // Kept up while an Undo is offered, so deleting the last entry can be undone.
  if (points.length === 0 && !undoLabel) return null;
  return (
    <section className="flex flex-col gap-1">
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
        History
      </h2>
      {undoLabel && <UndoBar label={undoLabel} onUndo={onUndo} />}
      <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
        {(showAll ? points : points.slice(0, HISTORY_PREVIEW)).map((point) => (
          <li key={point.id} className="flex items-center gap-2 py-1">
            <span className="min-w-0 flex-1 truncate text-sm text-zinc-600 dark:text-zinc-400">
              {point.measuredAt.toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <span className="text-sm font-medium tabular-nums">{formatValue(point)}</span>
            <button
              type="button"
              onClick={() => onDelete(point.id)}
              aria-label={deleteLabel(point)}
              className="flex h-11 w-11 items-center justify-center text-zinc-400 dark:text-zinc-600"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {!showAll && points.length > HISTORY_PREVIEW && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="min-h-11 text-sm font-medium underline underline-offset-4"
        >
          Show all {points.length.toLocaleString()}
        </button>
      )}
    </section>
  );
}
