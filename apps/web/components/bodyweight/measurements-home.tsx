"use client";

import {
  LogEntryForm,
  MeasurementHistory,
  RangePicker,
  formatMeasurement,
  formatMeasurementChange,
  localDateInput,
} from "@/components/bodyweight/measurement-log";
import { useUndoable } from "@/components/undo-bar";
import type { BodyMeasurementRow } from "@/lib/db/schema";

import { TrendChart } from "@/components/charts/trend-chart";
import { PAGE_BODY, PageHeader } from "@/components/page-header";
import {
  deleteMeasurement,
  logMeasurement,
  measurementSeries,
  restoreMeasurement,
} from "@/lib/bodyweight";
import { TRACKED_MEASUREMENT_KINDS, type TrackedMeasurementKind } from "@/lib/bodyweight/series";
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
import Link from "next/link";
import { useMemo, useState } from "react";

const KINDS = TRACKED_MEASUREMENT_KINDS;

type Kind = TrackedMeasurementKind;

const RANGES = [
  { key: "3m", label: "3M", days: 91 },
  { key: "1y", label: "1Y", days: 365 },
  { key: "all", label: "All", days: null },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

/** "32.5 in", but "18%" with no space for body fat. */
function withUnit(value: number, unitLabel: string): string {
  return unitLabel === "%"
    ? `${formatMeasurement(value)}%`
    : `${formatMeasurement(value)} ${unitLabel}`;
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
  const undoableDelete = useUndoable<BodyMeasurementRow>();

  function pickKind(next: Kind) {
    setKind(next);
    setValue("");
    setLogError(null);
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
    undoableDelete.offer("Measurement deleted", await deleteMeasurement(row));
    void runSyncCycle();
  }

  async function handleUndoDelete() {
    const deleted = undoableDelete.take();
    if (!deleted) return;
    await restoreMeasurement(deleted);
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
                {formatMeasurement(latest.value)}
              </span>
              <span className="text-sm text-zinc-500 dark:text-zinc-500">
                {unitLabel === "%" ? "% body fat" : `${unitLabel} ${label.toLowerCase()}`}
              </span>
              {first && first !== latest && (
                <span className="ml-auto text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
                  {formatMeasurementChange(latest.value - first.value)}
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
                <RangePicker ranges={RANGES} value={range} onChange={setRange} />
              )}
              <TrendChart
                points={visible}
                label={label}
                unit={unitLabel}
                size="compact"
                emptyText={`No ${label.toLowerCase()} measurements in this range.`}
              />
            </>
          )}
        </section>

        <LogEntryForm
          heading={`Log ${label.toLowerCase()}`}
          valueLabel={`${label} (${unitLabel})`}
          value={value}
          onValueChange={setValue}
          date={date}
          onDateChange={setDate}
          saving={saving}
          error={logError}
          submitLabel={`Log ${label.toLowerCase()}`}
          onSubmit={() => void handleLog()}
        >
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            Bodyweight has its own page:{" "}
            <Link href="/profile/weight" className="underline underline-offset-4">
              Bodyweight
            </Link>
            .
          </p>
        </LogEntryForm>

        <MeasurementHistory
          key={kind}
          points={history}
          formatValue={(point) => withUnit(point.value, unitLabel)}
          deleteLabel={(point) =>
            `Delete the ${point.measuredAt.toLocaleDateString()} ${label.toLowerCase()} measurement`
          }
          onDelete={(id) => void handleDelete(id)}
          undoLabel={undoableDelete.label}
          onUndo={() => void handleUndoDelete()}
        />
      </div>
    </main>
  );
}
