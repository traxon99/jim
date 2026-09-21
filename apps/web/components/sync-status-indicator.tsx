"use client";

import { runSyncCycle } from "@/lib/sync/engine";
import { getSyncStatus, subscribeSyncStatus } from "@/lib/sync/status";
import { useSyncExternalStore } from "react";

/**
 * Persistent sync status — never silent (ADR-002): the user always knows
 * whether a workout is actually safe on the server yet.
 */
export function SyncStatusIndicator() {
  const status = useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus);

  if (status.kind === "synced") {
    return (
      <output className="block px-4 py-1 text-center text-xs text-zinc-500 dark:text-zinc-500">
        Synced
      </output>
    );
  }

  if (status.kind === "pending") {
    return (
      <output className="block px-4 py-1 text-center text-xs text-zinc-500 dark:text-zinc-500">
        Pending {status.count}
      </output>
    );
  }

  return (
    <output className="flex items-center justify-center gap-2 px-4 py-1 text-xs text-red-600 dark:text-red-400">
      <span>Sync error · {status.count} pending</span>
      <button
        type="button"
        onClick={() => void runSyncCycle()}
        className="underline underline-offset-2"
      >
        Retry
      </button>
    </output>
  );
}
