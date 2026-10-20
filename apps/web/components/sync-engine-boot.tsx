"use client";

import { trackBootPromise } from "@/lib/boot/ready";
import { db } from "@/lib/db/schema";
import { refreshSettings } from "@/lib/settings";
import { startSyncEngine } from "@/lib/sync/engine";
import { useEffect } from "react";

/**
 * How long the boot splash waits on the network at most. Offline fails fast
 * on its own; this is for a request that hangs on bad reception, so the app
 * opens on what's already on the device instead.
 */
const BOOT_NETWORK_CAP_MS = 5000;

/** Mounts the sync engine's foreground triggers for the lifetime of the shell. */
export function SyncEngineBoot() {
  // The boot splash holds until the first sync cycle lands, so the app opens
  // on fresh data instead of re-rendering under the user a moment later.
  // Only on a first open with nothing local: when this phone already has
  // data, the app opens on it and the sync lands underneath (#678).
  useEffect(
    () =>
      startSyncEngine(undefined, undefined, (cycle) => {
        // Not always tracked below, so it needs its own handler.
        cycle.catch((error: unknown) => console.error("[sync] boot cycle failed:", error));
        trackBootPromise(
          hasSyncedBefore().then((synced) => (synced ? undefined : cycle)),
          BOOT_NETWORK_CAP_MS,
        );
      }),
    [],
  );
  // Refreshes the cached bar weight / plates / rest default once per boot —
  // rare to change, so it doesn't need its own foreground triggers the way
  // outbox sync does. The splash waits for it too: it carries the appearance
  // settings (theme, accent, font).
  useEffect(() => {
    const refresh = refreshSettings();
    trackBootPromise(
      // Appearance settings already cached in Dexie apply without the network.
      hasCachedSettings().then((cached) => (cached ? undefined : refresh)),
      BOOT_NETWORK_CAP_MS,
    );
  }, []);
  return null;
}

async function hasSyncedBefore(): Promise<boolean> {
  const meta = await db.syncMeta.get("meta").catch(() => undefined);
  return (meta?.cursor ?? 0) > 0;
}

async function hasCachedSettings(): Promise<boolean> {
  return (await db.settings.get("me").catch(() => undefined)) !== undefined;
}
