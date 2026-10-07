"use client";

import { TrendChart } from "@/components/bodyweight/bodyweight-chart";
import { PAGE_BODY, PageHeader } from "@/components/page-header";
import { deleteMeasurement, logMeasurement, measurementSeries } from "@/lib/bodyweight";
import { db } from "@/lib/db/schema";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { runSyncCycle } from "@/lib/sync/engine";
import {
  MEASUREMENT_LABELS,
  type MeasurementKind,
  displayUnitFor,
  measurementDimension,
  measurementUnitLabel,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

/** Bodyweight has its own page; these are the rest of issue #249's list. */
const KINDS = [
  "waist",
  "chest",
  "arms",
  "body_fat",
  "neck",
  "hips",
  "thighs",
  "calves",
] as const satisfies readonly MeasurementKind[];

type Kind = (typeof KINDS)[number];

const RANGES = [
  { key: "3m", label: "3M", days: 91 },
  { key: "1y", label: "1Y", days: 365 },
  { key: "all", label: "All", days: null },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

const HISTORY_PREVIEW = 20;

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

function localDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatValue(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatChange(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return "±0";
  return `${rounded > 0 ? "+" : "−"}${formatValue(Math.abs(rounded))}`;
}

/** "32.5 in", but "18%" with no space for body fat. */
function withUnit(value: number, unitLabel: string): string {
  return unitLabel === "%" ? `${formatValue(value)}%` : `${formatValue(value)} ${unitLabel}`;
}

/**
 * Profile → Measurements (issue #249): log body fat and circumferences
 * over time and see each one's trend. Reads and writes IndexedDB, so it
 * works offline; entries sync through the outbox like weigh-ins do.
 */
export function MeasurementsHome({ userId }: { userId: string }) {
  const settings = useLiveQuery(() => db.settings.get("me"), []);
  const units = settings?.units ?? DEFAULT_SETTINGS.units;
  const rows = useLiveQuery(() => db.bodyMeasurements.toArray(), []);

  const [kind, setKind] = useState<Kind>("waist");
  const [range, setRange] = useState<RangeKey>("all");
  const [value, setValue] = useState("");
  const [date, setDate] = useState(() => localDateInput(new Date()));
  const [logError, setLogError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const unit = displayUnitFor(kind, units);
  const unitLabel = measurementUnitLabel(unit);
  const label = MEASUREMENT_LABELS[kind];

  const latestByKind = useMemo(() => {
    const latest = new Map<Kind, number>();
    for (const k of KINDS) {
      const series = measurementSeries(rows ?? [], k, displayUnitFor(k, units));
      const last = series[series.length - 1];
      if (last) latest.set(k, last.value);
    }
    return latest;
  }, [rows, units]);

  const series = useMemo(() => measurementSeries(rows ?? [], kind, unit), [rows, kind, unit]);
  const latest = series[series.length - 1];
  const visible = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)?.days ?? null;
    if (days == null || !latest) return series;
    const from = latest.measuredAt.getTime() - days * 86_400_000;
    return series.filter((point) => point.measuredAt.getTime() >= from);
  }, [series, range, latest]);
  const first = visible[0];
  const history = useMemo(() => [...series].reverse(), [series]);
  const rowById = useMemo(() => new Map((rows ?? []).map((row) => [row.id, row])), [rows]);

  function pickKind(next: Kind) {
    setKind(next);
    setValue("");
    setLogError(null);
    setShowAll(false);
  }

  async function handleLog() {
    const parsed = Number(value.replace(",", "."));
    const max = measurementDimension(kind) === "percent" ? 100 : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= max) {
      setLogError(
        max === 100
          ? "Enter body fat as a percentage between 0 and 100"
          : `Enter your ${label.toLowerCase()} as a positive number`,
      );
      return;
    }
    const [y, m, d] = date.split("-").map(Number);
    if (!y || !m || !d) {
      setLogError("Pick a date");
      return;
    }
    const now = new Date();
    const measuredAt = localDateInput(now) === date ? now : new Date(y, m - 1, d, 12);
    setSaving(true);
    setLogError(null);
    try {
      await logMeasurement({ userId, kind, value: parsed, unit, measuredAt });
      setValue("");
      setDate(localDateInput(new Date()));
      void runSyncCycle();
    } catch {
      setLogError("Couldn't save that measurement. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const row = rowById.get(id);
    if (!row) return;
    await deleteMeasurement(row);
    void runSyncCycle();
  }

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader title="Measurements" back={{ href: "/profile", label: "Profile" }} />
      <div className={PAGE_BODY}>
        <fieldset className="grid grid-cols-4 gap-2" aria-label="Measurement">
          {KINDS.map((option) => {
            const latestValue = latestByKind.get(option);
            const optionUnit = measurementUnitLabel(displayUnitFor(option, units));
            return (
              <button
                key={option}
                type="button"
                aria-pressed={kind === option}
                onClick={() => pickKind(option)}
                className={`flex min-h-14 min-w-0 flex-col items-center justify-center rounded-lg border px-1 py-1.5 text-xs font-medium ${
                  kind === option
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                }`}
              >
                <span className="w-full truncate text-center">{MEASUREMENT_LABELS[option]}</span>
                <span className="w-full truncate text-center tabular-nums opacity-70">
                  {latestValue == null ? "–" : withUnit(latestValue, optionUnit)}
                </span>
              </button>
            );
          })}
        </fieldset>

        <section className="flex flex-col gap-3">
          {latest ? (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-3xl font-semibold tabular-nums">
                {formatValue(latest.value)}
              </span>
              <span className="text-sm text-zinc-500 dark:text-zinc-500">
                {unitLabel === "%" ? "% body fat" : `${unitLabel} ${label.toLowerCase()}`}
              </span>
              {first && first !== latest && (
                <span className="ml-auto text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
                  {formatChange(latest.value - first.value)}
                  {unitLabel === "%" ? " pts" : ` ${unitLabel}`} since{" "}
                  {first.measuredAt.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              )}
            </div>
          ) : (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              No {label.toLowerCase()} measurements yet. Log one below to start a trend.
            </p>
          )}

          {series.length > 0 && (
            <>
              {series.length > 1 && (
                <fieldset className="flex gap-1" aria-label="Chart range">
                  {RANGES.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      aria-pressed={range === option.key}
                      onClick={() => setRange(option.key)}
                      className={`flex min-h-9 flex-1 items-center justify-center rounded-lg text-sm font-medium ${
                        range === option.key
                          ? "bg-accent text-accent-foreground"
                          : "text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </fieldset>
              )}
              <TrendChart
                points={visible}
                label={label}
                emptyText={`No ${label.toLowerCase()} measurements in this range.`}
              />
            </>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
            Log {label.toLowerCase()}
          </h2>
          <div className="flex gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium">
              {label} ({unitLabel})
              <input
                type="text"
                inputMode="decimal"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleLog();
                }}
                className={inputClass}
              />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium">
              Date
              <input
                type="date"
                value={date}
                max={localDateInput(new Date())}
                onChange={(event) => setDate(event.target.value)}
                className={inputClass}
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => void handleLog()}
            disabled={saving || value.trim() === ""}
            className="flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            {saving ? "Saving…" : `Log ${label.toLowerCase()}`}
          </button>
          {logError && (
            <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{logError}</p>
          )}
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            Bodyweight has its own page:{" "}
            <Link href="/profile/weight" className="underline underline-offset-4">
              Bodyweight
            </Link>
            .
          </p>
        </section>

        {history.length > 0 && (
          <section className="flex flex-col gap-1">
            <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
              History
            </h2>
            <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
              {(showAll ? history : history.slice(0, HISTORY_PREVIEW)).map((point) => (
                <li key={point.id} className="flex items-center gap-2 py-1">
                  <span className="min-w-0 flex-1 truncate text-sm text-zinc-600 dark:text-zinc-400">
                    {point.measuredAt.toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  <span className="text-sm font-medium tabular-nums">
                    {withUnit(point.value, unitLabel)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleDelete(point.id)}
                    aria-label={`Delete the ${point.measuredAt.toLocaleDateString()} ${label.toLowerCase()} measurement`}
                    className="flex h-11 w-11 items-center justify-center text-zinc-400 dark:text-zinc-600"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
            {!showAll && history.length > HISTORY_PREVIEW && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="min-h-11 text-sm font-medium underline underline-offset-4"
              >
                Show all {history.length.toLocaleString()}
              </button>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
