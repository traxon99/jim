"use client";

import { loadExportTables } from "@/app/portal/export/actions";
import {
  type ExportTables,
  bodyweightCsvFromTables,
  downloadFile,
  exportFileName,
  jsonExportFromTables,
  strongCsvFromTables,
} from "@/lib/data-transfer/export-build";
import { Download } from "lucide-react";
import { useRef, useState } from "react";
import { PortalSectionHeader } from "./analysis-range";

type FileKind = "workouts" | "bodyweight" | "json";

const FILES: {
  kind: FileKind;
  title: string;
  description: string;
  button: string;
}[] = [
  {
    kind: "workouts",
    title: "Workouts",
    description:
      "Every finished workout, one row per set, in Strong's CSV layout, which Jim's workout import and spreadsheets read.",
    button: "Download workouts CSV",
  },
  {
    kind: "bodyweight",
    title: "Bodyweight",
    description:
      "Every weigh-in, in the unit you logged it, in Strong's measurements layout. Jim's bodyweight import reads it back.",
    button: "Download bodyweight CSV",
  },
  {
    kind: "json",
    title: "Everything",
    description:
      "All your data as JSON: workouts, routines, programs, custom exercises, PRs, measurements, PRP blocks, gyms and settings. The same file as Settings → Account → Your data on the phone.",
    button: "Download JSON",
  },
];

/**
 * The Analysis Export section (issue #470): the phone's data export, from
 * desktop. Rows load from the server when a download is asked for, and the
 * file is built in the browser with the same builders as the phone, so
 * dates are written in local time either way.
 */
export function PortalExport({ summary }: { summary: { workouts: number; weighIns: number } }) {
  const [busy, setBusy] = useState<FileKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One download often follows another; the rows don't change in between.
  const tables = useRef<Promise<ExportTables> | null>(null);

  async function download(kind: FileKind) {
    setBusy(kind);
    setError(null);
    try {
      tables.current ??= loadExportTables();
      const data = await tables.current;
      const now = new Date();
      const file =
        kind === "workouts"
          ? new File([strongCsvFromTables(data)], exportFileName("csv", now, "workouts"), {
              type: "text/csv",
            })
          : kind === "bodyweight"
            ? new File([bodyweightCsvFromTables(data)], exportFileName("csv", now, "bodyweight"), {
                type: "text/csv",
              })
            : new File([jsonExportFromTables(data, now)], exportFileName("json", now), {
                type: "application/json",
              });
      downloadFile(file);
    } catch {
      tables.current = null;
      setError("Couldn't create the file. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const counts: Record<FileKind, string> = {
    workouts: `${summary.workouts.toLocaleString()} workout${summary.workouts === 1 ? "" : "s"}`,
    bodyweight: `${summary.weighIns.toLocaleString()} weigh-in${summary.weighIns === 1 ? "" : "s"}`,
    json: "Everything in your account",
  };

  return (
    <div className="route-fade flex flex-col gap-6">
      <PortalSectionHeader title="Export" />
      <ul className="grid gap-3 md:grid-cols-3">
        {FILES.map((file) => (
          <li
            key={file.kind}
            className="flex min-w-0 flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <h2 className="text-base font-semibold">{file.title}</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-500">{counts[file.kind]}</p>
            <p className="flex-1 text-sm text-zinc-600 dark:text-zinc-400">{file.description}</p>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void download(file.kind)}
              className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-50"
            >
              <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              {busy === file.kind ? "Preparing…" : file.button}
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
