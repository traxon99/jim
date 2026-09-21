"use client";

import { refreshSettings } from "@/lib/settings";
import { startSyncEngine } from "@/lib/sync/engine";
import { useEffect } from "react";

/** Mounts the sync engine's foreground triggers for the lifetime of the shell. */
export function SyncEngineBoot() {
  useEffect(() => startSyncEngine(), []);
  // Refreshes the cached bar weight / plates / rest default once per boot —
  // rare to change, so it doesn't need its own foreground triggers the way
  // outbox sync does.
  useEffect(() => {
    void refreshSettings();
  }, []);
  return null;
}
