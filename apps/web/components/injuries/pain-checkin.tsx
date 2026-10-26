"use client";

import type { InjuryRow, PainCheckinRow } from "@/lib/db/schema";
import { logPain, markHealed } from "@/lib/injuries";
import { injuryAreaLabel, latestPainByDay, shouldAskHealed, todaysPain } from "@jim/core";
import { useState } from "react";
import { PainPicker } from "./pain-picker";

function askedKey(injuryId: string): string {
  return `jim:healed-asked:${injuryId}`;
}

/** The last check-in day the user answered "Not yet" for, on this device. */
function readNotYet(injuryId: string): string | null {
  try {
    return window.localStorage.getItem(askedKey(injuryId));
  } catch {
    return null;
  }
}

function writeNotYet(injuryId: string, day: string): void {
  try {
    window.localStorage.setItem(askedKey(injuryId), day);
  } catch {
    // Storage blocked: the question just comes back next time.
  }
}

/**
 * "Pain's been 0 for 3 check-ins. Healed?" (issue #627). Jim only asks: the
 * user marks it healed. "Not yet" holds the question until the next check-in.
 */
export function HealedPrompt({
  injury,
  checkins,
  today,
}: {
  injury: InjuryRow;
  checkins: readonly PainCheckinRow[];
  today: string;
}) {
  const lastDay = [...latestPainByDay(checkins, injury.id).keys()].at(-1) ?? null;
  const [notYet, setNotYet] = useState(() => readNotYet(injury.id));
  const [error, setError] = useState<string | null>(null);
  if (!shouldAskHealed(checkins, injury.id) || (lastDay !== null && notYet === lastDay)) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-900">
      <p>No pain for 3 check-ins in a row. Healed?</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setError(null);
            markHealed(injury, today).catch(() => setError("Couldn't save. Try again."));
          }}
          className="min-h-11 flex-1 rounded-lg bg-accent px-3 text-sm font-medium text-accent-foreground"
        >
          Mark healed
        </button>
        <button
          type="button"
          onClick={() => {
            if (!lastDay) return;
            writeNotYet(injury.id, lastDay);
            setNotYet(lastDay);
          }}
          className="min-h-11 flex-1 rounded-lg border border-zinc-300 px-3 text-sm font-medium dark:border-zinc-700"
        >
          Not yet
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Today's pain check-in for each open injury (issue #627): on the
 * pre-workout sheet, at the top of a workout that hasn't had one, and on
 * Profile → Injuries for rest days. A tap logs it; tapping again the same
 * day changes it.
 */
export function PainCheckin({
  injuries,
  checkins,
  today,
}: {
  injuries: readonly InjuryRow[];
  checkins: readonly PainCheckinRow[];
  today: string;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {injuries.map((injury) => {
        const label = injuryAreaLabel(injury.area, injury.side);
        return (
          <div key={injury.id} className="flex min-w-0 flex-col gap-1.5">
            <p className="text-sm font-semibold">{label}: pain today</p>
            <PainPicker
              value={todaysPain(checkins, injury.id, today)}
              label={`${label} pain today`}
              onChange={(level) => {
                setError(null);
                logPain(injury, level, today).catch(() =>
                  setError("Couldn't save your check-in. Try again."),
                );
              }}
            />
            <HealedPrompt injury={injury} checkins={checkins} today={today} />
          </div>
        );
      })}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
