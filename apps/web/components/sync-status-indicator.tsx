"use client";

import { runSyncCycle } from "@/lib/sync/engine";
import { getSyncStatus, subscribeSyncStatus } from "@/lib/sync/status";
import { RotateCw } from "lucide-react";
import { useSyncExternalStore } from "react";

export function SyncStatusIndicator() {
  const status = useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus);

  if (status.kind === "synced") {
    return null;
  }

  if (status.kind === "pending") {
    return (
      <output className="block px-4 py-1 text-center text-xs text-zinc-500 dark:text-zinc-500">
        Pending {status.count}
      </output>
    );
  }

  return (
    <output className="allow-pwa-select flex items-center justify-center gap-2 px-4 py-1 text-xs text-red-600 dark:text-red-400">
      <span>Sync error · {status.count} pending</span>
      <button
        type="button"
        onClick={() => void runSyncCycle()}
        aria-label="Retry sync"
        className="flex min-h-8 min-w-8 items-center justify-center"
      >
        <RotateCw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
      </button>
    </output>
  );
}
