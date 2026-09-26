"use client";

import { db } from "@/lib/db/schema";
import { currentBlock, liveBlockLifts } from "@/lib/dpr/block";
import { defaultRepRange, loadDprSnapshot } from "@/lib/dpr/data";
import { DEFAULT_SETTINGS, patchSettings } from "@/lib/settings";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BlockEditor } from "./block-editor";
import { BlockSummary } from "./block-summary";
import { SetupWizard } from "./setup-wizard";

/**
 * DPR's home (issue #211): the setup wizard until a block is running, then
 * the block and its mid-block editor.
 */
export function ProgressionHome({ userId }: { userId: string }) {
  const cached = useLiveQuery(() => db.settings.get("me"), []);
  const settings = cached ?? DEFAULT_SETTINGS;
  const blocks = useLiveQuery(() => db.dprBlocks.toArray(), []);
  const lifts = useLiveQuery(() => db.dprBlockLifts.toArray(), []);
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  const programs = useLiveQuery(() => db.programs.toArray(), []);
  const snapshot = useLiveQuery(
    () => loadDprSnapshot(db, defaultRepRange(settings)),
    [settings.dprDefaultRepLow, settings.dprDefaultRepHigh],
  );
  const [error, setError] = useState<string | null>(null);

  const loading = !blocks || !lifts || !exercises || !programs || !snapshot;
  const block = blocks ? currentBlock(blocks) : null;
  const activeProgram = programs?.find((program) => program.isActive && !program.deletedAt) ?? null;

  async function enable() {
    setError(null);
    const result = await patchSettings({ dprEnabled: true });
    if (!result.ok) setError(result.error);
  }

  return (
    <main className="flex flex-1 flex-col gap-4 px-4 py-4">
      <div className="flex flex-col items-start gap-1">
        <Link
          href="/profile/settings"
          className="flex min-h-11 items-center gap-1 text-sm font-medium text-zinc-500 dark:text-zinc-500"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Settings
        </Link>
        <h1 className="text-xl font-semibold">Progression</h1>
      </div>

      {loading && <p className="text-sm text-zinc-500 dark:text-zinc-500">Loading…</p>}

      {!loading && block && !settings.dprEnabled && (
        <div className="flex flex-col gap-2 rounded-lg border border-zinc-300 px-4 py-3 dark:border-zinc-700">
          <p className="text-sm">
            Dynamic Progression is off. Your block and lifts are saved — turn it back on to pick up
            where you left off.
          </p>
          <button
            type="button"
            onClick={() => void enable()}
            className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground"
          >
            Turn on
          </button>
        </div>
      )}

      {!loading && block && (
        <>
          <BlockSummary
            block={block}
            lifts={liveBlockLifts(lifts, block.id)}
            exercises={exercises}
            units={settings.units}
          />
          <BlockEditor
            block={block}
            lifts={liveBlockLifts(lifts, block.id)}
            exercises={exercises}
            snapshot={snapshot}
            settings={settings}
          />
        </>
      )}

      {!loading && !block && (
        <SetupWizard
          userId={userId}
          settings={settings}
          exercises={exercises}
          snapshot={snapshot}
          activeProgram={activeProgram}
        />
      )}

      {error && <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{error}</p>}
    </main>
  );
}
