"use client";

import { useBootTask } from "@/lib/boot/use-boot-task";

/**
 * The shared "Loading…" placeholder. While one is on screen during a cold
 * open, the boot splash stays up (lib/boot/gate.ts), so the app is never
 * revealed half-loaded.
 */
export function LoadingText({
  className = "text-sm text-zinc-500 dark:text-zinc-500",
}: {
  className?: string;
}) {
  useBootTask(true);
  return <p className={className}>Loading…</p>;
}
