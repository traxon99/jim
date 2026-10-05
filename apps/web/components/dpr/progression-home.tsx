"use client";

import { LoadingText } from "@/components/loading-text";
import { PAGE_BODY, PageHeader } from "@/components/page-header";
import { db } from "@/lib/db/schema";
import {
  completeBlock,
  currentBlock,
  endBlockNow,
  lastCompletedBlock,
  liveBlockLifts,
  setBlockVolumeMode,
  startDeloadWeek,
} from "@/lib/dpr/block";
import { buildDprContext, liftGoal } from "@/lib/dpr/calls";
import { defaultRepRange, loadDprSnapshot } from "@/lib/dpr/data";
import { DEFAULT_SETTINGS, patchSettings } from "@/lib/settings";
import {
  blockEffectiveEnd,
  blockHasEnded,
  blockRecapSummary,
  liftRecap,
  nextBlockBaselines,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { BlockEditor } from "./block-editor";
import { BlockRecap } from "./block-recap";
import { BlockHeader } from "./block-summary";
import { LiftCard } from "./lift-card";
import { SetupWizard } from "./setup-wizard";
import { VolumePlan } from "./volume-plan";

/**
 * DPR's home (issues #211, #214, #215): the setup wizard until a block is
 * running; then the block's progress; at its end the recap, an optional
 * deload week, and the next block.
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
  const [busy, setBusy] = useState(false);
  const now = useMemo(() => new Date(), []);

  const loading = !blocks || !lifts || !exercises || !programs || !snapshot;
  const block = blocks ? currentBlock(blocks) : null;
  const activeProgram = programs?.find((program) => program.isActive && !program.deletedAt) ?? null;

  // The page shows the block even with DPR switched off, so it can offer to
  // turn it back on.
  const context = useMemo(
    () =>
      blocks && lifts && exercises && snapshot
        ? buildDprContext({
            settings: { ...settings, dprEnabled: true },
            blocks,
            lifts,
            exercises,
            snapshot,
            now,
          })
        : null,
    [settings, blocks, lifts, exercises, snapshot, now],
  );
  const blockLifts = block && lifts ? liveBlockLifts(lifts, block.id) : [];
  const liftIds = blockLifts.map((lift) => lift.exerciseId);

  // Prefill for the next block: the last finished block's lifts, at their
  // final e1RMs.
  const prefill = useMemo(() => {
    if (!blocks || !lifts || !snapshot || block) return null;
    const previous = lastCompletedBlock(blocks);
    if (!previous) return null;
    const previousLifts = liveBlockLifts(lifts, previous.id);
    const recaps = previousLifts.map((lift) =>
      liftRecap(snapshot, lift.exerciseId, previous, liftGoal(lift), previous.endsAt),
    );
    return {
      focus: previousLifts.map((lift) => lift.exerciseId),
      baselines: nextBlockBaselines(recaps),
    };
  }, [blocks, lifts, snapshot, block]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  async function enable() {
    const result = await patchSettings({ dprEnabled: true });
    if (!result.ok) setError(result.error);
  }

  function renderBlock() {
    if (!block || !snapshot || !context) return null;
    const effectiveEnd = blockEffectiveEnd(block, snapshot, liftIds, now);

    if (blockHasEnded(block, snapshot, liftIds, now)) {
      const recaps = blockLifts.map((lift) =>
        liftRecap(snapshot, lift.exerciseId, block, liftGoal(lift), effectiveEnd),
      );
      return (
        <BlockRecap
          block={block}
          recaps={recaps}
          summary={blockRecapSummary(recaps)}
          exercises={context.exercises}
          units={settings.units}
          busy={busy}
          onDeload={() => void run(() => startDeloadWeek(block))}
          onNextBlock={() => void run(() => completeBlock(block))}
        />
      );
    }

    if (block.status === "deload" && now >= block.endsAt) {
      return (
        <section className="flex flex-col gap-2 rounded-lg border border-zinc-300 px-4 py-3 dark:border-zinc-700">
          <h2 className="text-base font-semibold">Deload week done</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Ready for the next block? Your lifts carry over, starting from where this block ended.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => completeBlock(block))}
            className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            Start next block
          </button>
        </section>
      );
    }

    return (
      <>
        <BlockHeader block={block} effectiveEnd={effectiveEnd} now={now} />
        {blockLifts.map((lift) => (
          <LiftCard key={lift.id} context={context} lift={lift} />
        ))}
        <VolumePlan
          context={context}
          busy={busy}
          onToggle={(on) => void run(() => setBlockVolumeMode(block, on))}
        />
        <BlockEditor
          block={block}
          lifts={blockLifts}
          exercises={exercises ?? []}
          snapshot={snapshot}
          settings={settings}
        />
        <div className="flex flex-col gap-2">
          <Link
            href="/profile/settings"
            className="flex min-h-11 items-center justify-between rounded-lg border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
          >
            Weight steps
            <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (block.status === "deload") {
                void run(() => completeBlock(block));
              } else if (confirm("End this block now and see the recap?")) {
                void run(() => endBlockNow(block));
              }
            }}
            className="min-h-11 rounded-lg border border-zinc-300 px-4 text-sm font-medium text-red-600 disabled:opacity-50 dark:border-zinc-700 dark:text-red-500"
          >
            {block.status === "deload" ? "Skip to next block" : "End block early"}
          </button>
        </div>
      </>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader title="Progression" back={{ href: "/profile/settings", label: "Settings" }} />
      <div className={PAGE_BODY}>
        {loading && <LoadingText />}

        {!loading && block && !settings.dprEnabled && (
          <div className="flex flex-col gap-2 rounded-lg border border-zinc-300 px-4 py-3 dark:border-zinc-700">
            <p className="text-sm">
              Dynamic Progression is off. Your block and lifts are saved — turn it back on to pick
              up where you left off.
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

        {!loading && block && renderBlock()}

        {!loading && !block && (
          <SetupWizard
            userId={userId}
            settings={settings}
            exercises={exercises}
            snapshot={snapshot}
            activeProgram={activeProgram}
            prefill={prefill}
          />
        )}

        {error && (
          <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{error}</p>
        )}
      </div>
    </main>
  );
}
