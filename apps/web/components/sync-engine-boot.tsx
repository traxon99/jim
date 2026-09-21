"use client";

import { startSyncEngine } from "@/lib/sync/engine";
import { useEffect } from "react";

/** Mounts the sync engine's foreground triggers for the lifetime of the shell. */
export function SyncEngineBoot() {
  useEffect(() => startSyncEngine(), []);
  return null;
}
