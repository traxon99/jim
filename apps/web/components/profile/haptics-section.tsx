"use client";

import { readHapticsEnabled, writeHapticsEnabled } from "@/lib/haptics";
import { useEffect, useState } from "react";

export function HapticsSection() {
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(readHapticsEnabled());
    setReady(true);
  }, []);

  if (!ready) return null;

  function handleToggle(next: boolean) {
    setEnabled(next);
    writeHapticsEnabled(next);
  }

  return (
    <div className="flex w-full max-w-xs flex-col gap-3 text-left">
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
        Haptics
      </h2>
      <label className="flex items-center justify-between gap-3 rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
        <span className="flex flex-col">
          <span className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
            Vibrate on tap
          </span>
          <span className="text-xs text-zinc-600 dark:text-zinc-400">
            Buzz when you log a set, finish a workout, skip rest, or switch tabs
          </span>
        </span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => handleToggle(event.target.checked)}
          className="h-5 w-5 shrink-0 accent-accent"
        />
      </label>
    </div>
  );
}
