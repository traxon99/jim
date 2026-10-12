import type { DprBlockLiftRow, DprBlockRow } from "@/lib/db/schema";
import { currentBlockOf } from "@jim/core";

/*
 * Picking blocks and their lifts out of the synced rows. Pure, with no
 * IndexedDB import, so the read-only desktop Analysis (issue #470) can use
 * it on Postgres rows too.
 */

/** The block DPR is running now (active or in its deload week), newest first wins. */
export function currentBlock(blocks: readonly DprBlockRow[]): DprBlockRow | null {
  return currentBlockOf(blocks);
}

export function liveBlockLifts(
  lifts: readonly DprBlockLiftRow[],
  blockId: string,
): DprBlockLiftRow[] {
  return lifts
    .filter((lift) => lift.blockId === blockId && !lift.deletedAt)
    .sort((a, b) => a.position - b.position);
}

/** The most recently started block that's finished — the next block prefills from it. */
export function lastCompletedBlock(blocks: readonly DprBlockRow[]): DprBlockRow | null {
  return (
    blocks
      .filter((block) => !block.deletedAt && block.status === "completed")
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0] ?? null
  );
}
