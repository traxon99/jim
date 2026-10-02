"use client";

import { trackBootPromise } from "@/lib/boot/ready";
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
  useEffect(
    () =>
      startSyncEngine(undefined, undefined, (cycle) =>
        trackBootPromise(cycle, BOOT_NETWORK_CAP_MS),
      ),
    [],
  );
  // Refreshes the cached bar weight / plates / rest default once per boot —
  // rare to change, so it doesn't need its own foreground triggers the way
  // outbox sync does. The splash waits for it too: it carries the appearance
  // settings (theme, accent, font).
  useEffect(() => {
    trackBootPromise(refreshSettings(), BOOT_NETWORK_CAP_MS);
  }, []);
  return null;
}
