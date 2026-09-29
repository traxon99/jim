"use client";

import { db } from "@/lib/db/schema";
import { shouldShowDprPrompt } from "@/lib/dpr/block";
import { DEFAULT_SETTINGS, patchSettings } from "@/lib/settings";
import { useLiveQuery } from "dexie-react-hooks";
import { TrendingUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

/**
 * One-time invite to Dynamic Progression (issue #203) once there's enough
 * history for it to work from. "Not now" dismisses it for good; Settings
 * still has the toggle.
 */
export function TryDprCard({ completedSessionCount }: { completedSessionCount: number }) {
  const cached = useLiveQuery(() => db.settings.get("me"), []);
  const [hidden, setHidden] = useState(false);
  const settings = cached ?? DEFAULT_SETTINGS;

  // Wait for the cached row: the defaults alone would flash the card for a
  // user who already dismissed it.
  if (!cached || hidden || !shouldShowDprPrompt(settings, completedSessionCount)) return null;

  async function dismiss() {
    setHidden(true);
    await patchSettings({ dprPromptDismissedAt: new Date() });
  }

  // A single row below the user's routines, not a half-screen card above
  // them (issue #329); the Progression page explains the rest.
  return (
    <section className="flex items-center gap-2 rounded-lg border border-accent py-1 pr-1 pl-3">
      <TrendingUp className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <Link href="/progression" className="flex min-h-11 min-w-0 flex-1 flex-col justify-center">
        <span className="text-sm font-semibold">Try Dynamic Progression</span>
        <span className="truncate text-xs text-zinc-600 dark:text-zinc-400">
          Jim suggests when to add weight, hold or back off
        </span>
      </Link>
      <button
        type="button"
        onClick={() => void dismiss()}
        className="min-h-11 shrink-0 px-3 text-sm font-medium text-zinc-500 dark:text-zinc-400"
      >
        Not now
      </button>
    </section>
  );
}
