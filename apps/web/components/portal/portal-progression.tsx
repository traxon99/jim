"use client";

import { BlockRecap } from "@/components/dpr/block-recap";
import { BlockHeader } from "@/components/dpr/block-summary";
import { formatDate } from "@/components/dpr/labels";
import { LiftCard } from "@/components/dpr/lift-card";
import { VolumePlan } from "@/components/dpr/volume-plan";
import { type PortalProgressionData, buildProgressionView } from "@/lib/portal/progression-data";
import { useMemo } from "react";
import { PortalSectionHeader } from "./analysis-range";
import { useIsClient } from "./use-is-client";

const HEADING = "text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500";

/**
 * The Analysis PRP section (issue #470): the phone's Progression screen,
 * read-only. The running block's week, each focused lift's progress, next
 * call (as a CallMark) and goal chart, the mesocycle set plan, and every
 * finished block's recap. Starting, editing or ending a block stays on the
 * phone.
 */
export function PortalProgression({ data }: { data: PortalProgressionData }) {
  const isClient = useIsClient();
  // The calls and dates follow the browser's clock and time zone.
  const view = useMemo(
    () => (isClient ? buildProgressionView(data, new Date()) : null),
    [isClient, data],
  );
  const exercises = useMemo(
    () => new Map(data.exercises.map((exercise) => [exercise.id, exercise])),
    [data.exercises],
  );

  return (
    <div className="route-fade flex flex-col gap-6">
      <PortalSectionHeader title="PRP" />

      {view && view.kind !== "none" && !data.settings.dprEnabled && (
        <p className="rounded-lg border border-zinc-200 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          PRP is off in Jim. Your block and lifts are saved; turn it back on under Settings, then
          Progression, to pick up where you left off.
        </p>
      )}

      {view?.kind === "none" && (
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          No PRP block is running. In Jim, open Settings, then Progression, to start one: it picks
          your lifts&apos; goals and calls each session UP, STAY or DOWN.
        </p>
      )}

      {view?.kind === "running" && (
        <>
          <BlockHeader
            block={view.context.block}
            effectiveEnd={view.effectiveEnd}
            now={view.context.now}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            {view.blockLifts.map((lift) => (
              <LiftCard key={lift.id} context={view.context} lift={lift} />
            ))}
          </div>
          <VolumePlan context={view.context} />
        </>
      )}

      {view?.kind === "ended" && (
        <div className="flex flex-col gap-2">
          <BlockRecap
            block={view.recap.block}
            recaps={view.recap.recaps}
            summary={view.recap.summary}
            exercises={exercises}
            units={data.settings.units}
          />
          <p className="text-sm text-zinc-500 dark:text-zinc-500">
            Take a deload week or start the next block in Jim.
          </p>
        </div>
      )}

      {view && view.pastBlocks.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className={HEADING}>Past blocks</h2>
          <ul className="flex flex-col gap-2">
            {view.pastBlocks.map((past) => (
              <li
                key={past.block.id}
                className="rounded-lg border border-zinc-200 px-4 dark:border-zinc-800"
              >
                <details>
                  <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-x-3 py-2 text-sm">
                    <span className="font-medium">
                      {past.block.weeks}-week block from {formatDate(past.block.startedAt)}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-500">
                      {past.summary.goalsSet > 0
                        ? `${past.summary.goalsHit} of ${past.summary.goalsSet} goals hit`
                        : `${past.recaps.length} lifts`}
                    </span>
                  </summary>
                  <div className="pb-3">
                    <BlockRecap
                      block={past.block}
                      recaps={past.recaps}
                      summary={past.summary}
                      exercises={exercises}
                      units={data.settings.units}
                      title="Recap"
                    />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
