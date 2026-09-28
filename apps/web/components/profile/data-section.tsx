"use client";

import { ExercisePicker } from "@/components/exercise-picker";
import {
  buildJsonExport,
  buildStrongCsvExport,
  exportFileName,
  saveFile,
} from "@/lib/data-transfer/export";
import {
  type ImportPreview,
  type ImportResult,
  commitWorkoutImport,
  previewWorkoutImport,
} from "@/lib/data-transfer/import";
import { db } from "@/lib/db/schema";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { runSyncCycle } from "@/lib/sync/engine";
import { type WeightUnit, WorkoutCsvError } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { Download, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";

const FORMAT_LABEL = { strong: "Strong", hevy: "Hevy" } as const;

function formatMonth(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function plural(count: number, word: string): string {
  return `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;
}

const secondaryButton =
  "flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-zinc-700";

/**
 * Settings → Your data: a full export (issue #242) and a Strong/Hevy import
 * with a preview step (issue #241). Everything reads and writes IndexedDB,
 * so both work offline; imported rows sync through the outbox as usual.
 */
export function DataSection({ userId }: { userId: string }) {
  const settings = useLiveQuery(() => db.settings.get("me"), []);
  const units = settings?.units ?? DEFAULT_SETTINGS.units;
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  const exerciseName = useMemo(
    () => new Map((exercises ?? []).map((exercise) => [exercise.id, exercise.name])),
    [exercises],
  );

  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"csv" | "json" | "reading" | "importing" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [fileUnit, setFileUnit] = useState<WeightUnit>(units);
  const [remapping, setRemapping] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleExport(kind: "csv" | "json") {
    setBusy(kind);
    setError(null);
    try {
      const contents = kind === "csv" ? await buildStrongCsvExport() : await buildJsonExport();
      await saveFile(
        contents,
        exportFileName(kind),
        kind === "csv" ? "text/csv" : "application/json",
      );
    } catch {
      setError("Couldn't create the export. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function handleFile(file: File) {
    setBusy("reading");
    setError(null);
    setResult(null);
    try {
      const next = await previewWorkoutImport(await file.text(), userId);
      setPreview(next);
      setMapping(Object.fromEntries(next.exercises.map((e) => [e.name, e.suggestedExerciseId])));
      setFileUnit(units);
    } catch (caught) {
      setError(
        caught instanceof WorkoutCsvError ? caught.message : "Couldn't read that file. Try again.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleImport() {
    if (!preview) return;
    setBusy("importing");
    setError(null);
    try {
      setResult(
        await commitWorkoutImport({ userId, workouts: preview.workouts, mapping, fileUnit }),
      );
      setPreview(null);
      void runSyncCycle();
    } catch {
      setError("The import failed and nothing was added. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex w-full flex-col gap-3 text-left">
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
        Your data
      </h2>

      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        Export every workout as a CSV (Strong's layout, one row per set), or everything you've made
        as JSON.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void handleExport("csv")}
          disabled={busy !== null}
          className={`${secondaryButton} flex-1`}
        >
          <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          {busy === "csv" ? "Exporting…" : "CSV"}
        </button>
        <button
          type="button"
          onClick={() => void handleExport("json")}
          disabled={busy !== null}
          className={`${secondaryButton} flex-1`}
        >
          <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          {busy === "json" ? "Exporting…" : "JSON"}
        </button>
      </div>

      {!preview && (
        <>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy !== null}
            className={secondaryButton}
          >
            <Upload className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            {busy === "reading" ? "Reading…" : "Import from Strong or Hevy"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv,text/comma-separated-values"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void handleFile(file);
            }}
          />
        </>
      )}

      {error && <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{error}</p>}

      {result && (
        <p className="allow-pwa-select text-xs text-emerald-600 dark:text-emerald-500">
          {result.sessions === 0
            ? "Nothing new to import. Those workouts are already in Jim."
            : `Imported ${plural(result.sessions, "workout")} and ${plural(result.sets, "set")}.`}
        </p>
      )}

      {preview && (
        <div className="flex flex-col gap-3 rounded-lg border border-zinc-300 p-3 dark:border-zinc-700">
          <div className="flex flex-col gap-1 text-sm">
            <p className="font-medium">{FORMAT_LABEL[preview.format]} export</p>
            {preview.workouts.length === 0 ? (
              <p className="text-zinc-600 dark:text-zinc-400">
                Nothing new. All {plural(preview.duplicateCount, "workout")} in this file are
                already in Jim.
              </p>
            ) : (
              <p className="text-zinc-600 dark:text-zinc-400">
                {plural(preview.workouts.length, "workout")} · {plural(preview.setCount, "set")}
                {preview.firstDate && preview.lastDate && (
                  <>
                    {" "}
                    · {formatMonth(preview.firstDate)} – {formatMonth(preview.lastDate)}
                  </>
                )}
                {preview.duplicateCount > 0 &&
                  `. ${plural(preview.duplicateCount, "workout")} already in Jim will be skipped.`}
              </p>
            )}
          </div>

          {preview.workouts.length > 0 && preview.needsUnit && (
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
                  They'll be converted to {units}.
                </span>
              )}
            </div>
          )}

          {preview.workouts.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium">Exercises</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-500">
                Check each match. Unmatched ones become new custom exercises.
              </p>
              <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
                {preview.exercises.map((exercise) => {
                  const mappedId = mapping[exercise.name] ?? null;
                  return (
                    <li key={exercise.name} className="flex items-center gap-2 py-2">
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="break-words text-sm font-medium">{exercise.name}</span>
                        <span
                          className={`break-words text-xs ${
                            mappedId
                              ? "text-zinc-500 dark:text-zinc-500"
                              : "text-amber-600 dark:text-amber-500"
                          }`}
                        >
                          {mappedId
                            ? `→ ${exerciseName.get(mappedId) ?? "Exercise"}`
                            : "→ New custom exercise"}{" "}
                          · {plural(exercise.setCount, "set")}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <button
                          type="button"
                          onClick={() => setRemapping(exercise.name)}
                          className="min-h-8 px-1 text-xs font-medium underline underline-offset-4"
                        >
                          Change
                        </button>
                        {mappedId && (
                          <button
                            type="button"
                            onClick={() =>
                              setMapping((current) => ({ ...current, [exercise.name]: null }))
                            }
                            className="min-h-8 px-1 text-xs font-medium text-zinc-500 underline underline-offset-4 dark:text-zinc-500"
                          >
                            Make custom
                          </button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPreview(null)}
              disabled={busy === "importing"}
              className={`${secondaryButton} flex-1`}
            >
              Cancel
            </button>
            {preview.workouts.length > 0 && (
              <button
                type="button"
                onClick={() => void handleImport()}
                disabled={busy === "importing"}
                className="flex min-h-11 flex-1 items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
              >
                {busy === "importing" ? "Importing…" : "Import"}
              </button>
            )}
          </div>
        </div>
      )}

      {remapping && (
        <ExercisePicker
          userId={userId}
          excludeExerciseIds={new Set()}
          mode="replace"
          onPick={([exerciseId]) => {
            if (exerciseId) setMapping((current) => ({ ...current, [remapping]: exerciseId }));
            setRemapping(null);
          }}
          onClose={() => setRemapping(null)}
        />
      )}
    </div>
  );
}
