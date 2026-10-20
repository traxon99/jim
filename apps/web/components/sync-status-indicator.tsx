"use client";

import { db } from "@/lib/db/schema";
import { runSyncCycle } from "@/lib/sync/engine";
import { syncIndicator } from "@/lib/sync/indicator";
import { getSyncStatus, subscribeSyncStatus } from "@/lib/sync/status";
import { useLiveQuery } from "dexie-react-hooks";
import { RotateCw } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

function subscribeOnline(listener: () => void): () => void {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

export function SyncStatusIndicator() {
  const status = useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus);
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  // Live, so a change saved with no signal counts up straight away (#665).
  const outboxCount = useLiveQuery(
    () => db.outbox.count(),
    [],
    "count" in status ? status.count : 0,
  );
  const pathname = usePathname();

  const indicator = syncIndicator(status, outboxCount, online);
  if (!indicator) return null;

  if (indicator.tone === "muted") {
    return (
      <output className="block px-4 py-1 text-center text-xs text-zinc-500 dark:text-zinc-500">
        {indicator.text}
      </output>
    );
  }

  return (
    <output className="allow-pwa-select flex items-center justify-center gap-2 px-4 py-1 text-xs text-red-600 dark:text-red-400">
      <span>{indicator.text}</span>
      {indicator.action === "sign-in" ? (
        <Link
          href={`/login?next=${encodeURIComponent(pathname)}`}
          data-ripple
          className="flex min-h-8 items-center font-medium underline underline-offset-2"
        >
          Sign in
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => void runSyncCycle()}
          aria-label="Retry sync"
          className="flex min-h-11 min-w-11 items-center justify-center"
        >
          <RotateCw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </output>
  );
}
