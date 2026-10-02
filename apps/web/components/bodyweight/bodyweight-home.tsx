"use client";

import { BodyweightChart } from "@/components/bodyweight/bodyweight-chart";
import { PAGE_BODY, PageHeader } from "@/components/page-header";
import {
  type WeightImportPreview,
  bodyweightSeries,
  commitWeightImport,
  deleteBodyweight,
  logBodyweight,
  previewWeightImport,
  syncCurrentBodyweight,
} from "@/lib/bodyweight";
import { db } from "@/lib/db/schema";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { runSyncCycle } from "@/lib/sync/engine";
import { type WeightUnit, WorkoutCsvError } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { ClipboardPaste, Trash2, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";

const RANGES = [
  { key: "1m", label: "1M", days: 30 },
  { key: "3m", label: "3M", days: 91 },
  { key: "1y", label: "1Y", days: 365 },
  { key: "all", label: "All", days: null },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

/** How many weigh-ins the history list shows before "Show all". */
const HISTORY_PREVIEW = 20;

const secondaryButton =
  "flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-zinc-700";
const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

function localDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatWeight(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatChange(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return "±0";
  return `${rounded > 0 ? "+" : "−"}${formatWeight(Math.abs(rounded))}`;
}

function plural(count: number, word: string): string {
  return `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * Profile → Bodyweight (issue #377): log weigh-ins, see the trend, and bring
 * history over from Strong. Reads and writes IndexedDB, so it all works
 * offline; entries sync through the outbox.
 */
export function BodyweightHome({ userId }: { userId: string }) {
  const settings = useLiveQuery(() => db.settings.get("me"), []);
  const units = settings?.units ?? DEFAULT_SETTINGS.units;
  const rows = useLiveQuery(() => db.bodyMeasurements.toArray(), []);
  const series = useMemo(() => bodyweightSeries(rows ?? [], units), [rows, units]);

  const [range, setRange] = useState<RangeKey>("3m");
  const [value, setValue] = useState("");
  const [date, setDate] = useState(() => localDateInput(new Date()));
  const [logError, setLogError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);
  const [importBusy, setImportBusy] = useState<"reading" | "importing" | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [preview, setPreview] = useState<WeightImportPreview | null>(null);
  const [fileUnit, setFileUnit] = useState<WeightUnit>(units);
  const [imported, setImported] = useState<number | null>(null);
  /** Pasted text, while the paste box is open; null when it's closed. */
  const [pasted, setPasted] = useState<string | null>(null);

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

  async function handleLog() {
    const weight = Number(value.replace(",", "."));
    if (!Number.isFinite(weight) || weight <= 0) {
      setLogError("Enter your weight as a positive number");
      return;
    }
    const [y, m, d] = date.split("-").map(Number);
    if (!y || !m || !d) {
      setLogError("Pick a date");
      return;
    }
    const now = new Date();
    const picked = new Date(y, m - 1, d, 12);
    const measuredAt = localDateInput(now) === date ? now : picked;
    setSaving(true);
    setLogError(null);
    try {
      await logBodyweight({ userId, value: weight, unit: units, measuredAt });
      setValue("");
      setDate(localDateInput(new Date()));
      void runSyncCycle();
      void syncCurrentBodyweight();
    } catch {
      setLogError("Couldn't save that weigh-in. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const row = rowById.get(id);
    if (!row) return;
    await deleteBodyweight(row);
    void runSyncCycle();
    void syncCurrentBodyweight();
  }

  async function readImport(text: Promise<string> | string) {
    setImportBusy("reading");
    setImportError(null);
    setImported(null);
    try {
      setPreview(await previewWeightImport(await text));
      setFileUnit(units);
      setPasted(null);
    } catch (caught) {
      setImportError(
        caught instanceof WorkoutCsvError ? caught.message : "Couldn't read that. Try again.",
      );
    } finally {
      setImportBusy(null);
    }
  }

  async function handleImport() {
    if (!preview) return;
    setImportBusy("importing");
    setImportError(null);
    try {
      setImported(await commitWeightImport({ userId, entries: preview.entries, fileUnit }));
      setPreview(null);
      void runSyncCycle();
      void syncCurrentBodyweight();
    } catch {
      setImportError("The import failed and nothing was added. Try again.");
    } finally {
      setImportBusy(null);
    }
  }

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader title="Bodyweight" back={{ href: "/profile", label: "Profile" }} />
      <div className={PAGE_BODY}>
        <section className="flex flex-col gap-3">
          {latest ? (
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">
                {formatWeight(latest.value)}
              </span>
              <span className="text-sm text-zinc-500 dark:text-zinc-500">{units}</span>
              {first && first !== latest && (
                <span className="ml-auto text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
                  {formatChange(latest.value - first.value)} {units} since{" "}
                  {first.measuredAt.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              )}
            </div>
          ) : (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Log your weight to start tracking it over time, or import your history from Strong.
            </p>
          )}

          {series.length > 0 && (
            <>
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
              <BodyweightChart points={visible} />
            </>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
            Log a weigh-in
          </h2>
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs font-medium">
              Weight ({units})
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
            <label className="flex flex-1 flex-col gap-1 text-xs font-medium">
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
            {saving ? "Saving…" : "Log weight"}
          </button>
          {logError && (
            <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{logError}</p>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
            Import
          </h2>
          {!preview && pasted != null && (
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1 text-xs font-medium">
                One weigh-in per line, date then weight
                <textarea
                  value={pasted}
                  onChange={(event) => setPasted(event.target.value)}
                  rows={6}
                  placeholder={"6/26/26 - 153.1\n6/29/26 149.7"}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className={inputClass}
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPasted(null);
                    setImportError(null);
                  }}
                  disabled={importBusy !== null}
                  className={`${secondaryButton} flex-1`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void readImport(pasted)}
                  disabled={importBusy !== null || pasted.trim() === ""}
                  className="flex min-h-11 flex-1 items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
                >
                  {importBusy === "reading" ? "Reading…" : "Preview"}
                </button>
              </div>
            </div>
          )}
          {!preview && pasted == null && (
            <>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Export your Weight measurement from Strong's settings as a CSV and pick it here.
                Other CSVs with a date and a weight column work too, or paste a list from your
                notes.
              </p>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={importBusy !== null}
                className={secondaryButton}
              >
                <Upload className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                {importBusy === "reading" ? "Reading…" : "Import weight from Strong"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPasted("");
                  setImportError(null);
                  setImported(null);
                }}
                disabled={importBusy !== null}
                className={secondaryButton}
              >
                <ClipboardPaste className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Paste weights from notes
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,.txt,text/csv,text/comma-separated-values,text/plain"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void readImport(file.text());
                }}
              />
            </>
          )}

          {importError && (
            <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{importError}</p>
          )}
          {imported != null && (
            <p className="allow-pwa-select text-xs text-emerald-600 dark:text-emerald-500">
              {imported === 0
                ? "Nothing new to import. Those weigh-ins are already in Jim."
                : `Imported ${plural(imported, "weigh-in")}.`}
            </p>
          )}

          {preview && (
            <div className="flex flex-col gap-3 rounded-lg border border-zinc-300 p-3 dark:border-zinc-700">
              <div className="flex flex-col gap-1 text-sm">
                <p className="font-medium">
                  {preview.format === "strong"
                    ? "Strong measurements"
                    : preview.format === "notes"
                      ? "Pasted weights"
                      : "Weight CSV"}
                </p>
                {preview.entries.length === 0 ? (
                  <p className="text-zinc-600 dark:text-zinc-400">
                    Nothing new. All {plural(preview.duplicateCount, "weigh-in")} in this file are
                    already in Jim.
                  </p>
                ) : (
                  <p className="text-zinc-600 dark:text-zinc-400">
                    {plural(preview.entries.length, "weigh-in")}
                    {preview.firstDate && preview.lastDate && (
                      <>
                        {" "}
                        · {preview.firstDate.toLocaleDateString()} –{" "}
                        {preview.lastDate.toLocaleDateString()}
                      </>
                    )}
                    {preview.duplicateCount > 0 &&
                      `. ${plural(preview.duplicateCount, "weigh-in")} already in Jim will be skipped.`}
                    {preview.skippedRows > 0 &&
                      ` ${plural(preview.skippedRows, preview.format === "notes" ? "line" : "row")} couldn't be read and will be skipped.`}
                    {preview.sameDayRows > 0 &&
                      ` ${plural(preview.sameDayRows, "day")} logged twice; the later line is kept.`}
                    {preview.outlierRows > 0 &&
                      ` Skipping ${plural(preview.outlierRows, "weight")} far off from the days around, likely a typo.`}
                  </p>
                )}
              </div>

              {preview.entries.length > 0 && preview.needsUnit && (
                <div className="flex flex-col gap-1 text-xs font-medium">
                  Weights in this file are in
                  <div className="flex gap-2">
                    {(["lb", "kg"] as const).map((unit) => (
                      <button
                        key={unit}
                        type="button"
                        aria-pressed={fileUnit === unit}
                        onClick={() => setFileUnit(unit)}
                        className={`flex min-h-11 flex-1 items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium ${
                          fileUnit === unit
                            ? "border-accent bg-accent text-accent-foreground"
                            : "border-zinc-300 bg-white text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                        }`}
                      >
                        {unit}
                      </button>
                    ))}
                  </div>
                  {fileUnit !== units && (
                    <span className="font-normal text-zinc-500 dark:text-zinc-500">
                      They'll show in {units}.
                    </span>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  disabled={importBusy === "importing"}
                  className={`${secondaryButton} flex-1`}
                >
                  Cancel
                </button>
                {preview.entries.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleImport()}
                    disabled={importBusy === "importing"}
                    className="flex min-h-11 flex-1 items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
                  >
                    {importBusy === "importing" ? "Importing…" : "Import"}
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        {history.length > 0 && (
          <section className="flex flex-col gap-1">
            <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
              History
            </h2>
            <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
              {(showAll ? history : history.slice(0, HISTORY_PREVIEW)).map((point) => (
                <li key={point.id} className="flex items-center gap-2 py-1">
                  <span className="flex-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {point.measuredAt.toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  <span className="text-sm font-medium tabular-nums">
                    {formatWeight(point.value)} {units}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleDelete(point.id)}
                    aria-label={`Delete the ${point.measuredAt.toLocaleDateString()} weigh-in`}
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
