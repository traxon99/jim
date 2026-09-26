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

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-accent px-4 py-4">
      <div className="flex items-start gap-3">
        <TrendingUp className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">Try Dynamic Progression</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Pick up to 5 lifts and Jim will suggest when to add weight, hold, or back off, based on
            your reps and RPE — with a strength goal for each training block.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Link
          href="/progression"
          className="flex min-h-11 flex-1 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground"
        >
          Set up
        </Link>
        <button
          type="button"
          onClick={() => void dismiss()}
          className="min-h-11 flex-1 rounded-lg border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
        >
          Not now
        </button>
      </div>
    </section>
  );
}
