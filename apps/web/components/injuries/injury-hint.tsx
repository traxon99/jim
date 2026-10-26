"use client";

import {
  INJURY_SUGGESTION_LABELS,
  type InjuryHit,
  type InjurySuggestion,
  painSuggestion,
} from "@jim/core";
import { Bandage, X } from "lucide-react";
import { useState } from "react";

/** How an open injury touches one exercise in a workout (issue #627). */
export interface ExerciseInjury {
  /** e.g. "Left knee". */
  label: string;
  hit: InjuryHit;
  /** Today's pain for that injury, null without a check-in. */
  pain: number | null;
}

function dismissedKey(sessionId: string): string {
  return `jim:injury-hint-dismissed:${sessionId}`;
}

function readDismissed(sessionId: string): string[] {
  try {
    const raw = window.localStorage.getItem(dismissedKey(sessionId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeDismissed(sessionId: string, ids: readonly string[]): void {
  try {
    window.localStorage.setItem(dismissedKey(sessionId), JSON.stringify(ids));
  } catch {
    // Storage blocked: the hint just comes back on the next visit.
  }
}

/** The small injury icon on an affected exercise's title. */
export function InjuryIcon({ injury }: { injury: ExerciseInjury }) {
  const text = `Works your ${injury.label.toLowerCase()}`;
  return (
    <span
      role="img"
      aria-label={text}
      title={text}
      className="flex shrink-0 items-center text-orange-600 dark:text-orange-400"
    >
      <Bandage className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
    </span>
  );
}

/**
 * What Jim suggests for an affected exercise at today's pain (issue #627):
 * go light at 1–3, swap at 4–6, skip at 7+. It only suggests; the workout
 * stays as it is. Each hint can be dismissed for this workout.
 */
export function InjuryHint({
  injury,
  sessionId,
  exerciseId,
  onSwap,
  className = "",
}: {
  injury: ExerciseInjury;
  sessionId: string;
  exerciseId: string;
  /** Opens Replace exercise, filtered to spare the area; absent once sets are logged. */
  onSwap?: () => void;
  className?: string;
}) {
  const [dismissed, setDismissed] = useState(() => readDismissed(sessionId).includes(exerciseId));
  const suggestion: InjurySuggestion | null = painSuggestion(injury.pain);
  if (dismissed || !suggestion) return null;

  function dismiss() {
    writeDismissed(sessionId, [...readDismissed(sessionId), exerciseId]);
    setDismissed(true);
  }

  return (
    <div
      className={`flex items-start gap-2 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-900 dark:bg-orange-950/60 dark:text-orange-200 ${className}`}
    >
      <Bandage className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="min-w-0">
          {injury.label}, pain {injury.pain}: {INJURY_SUGGESTION_LABELS[suggestion].toLowerCase()}
        </p>
        {suggestion === "swap" && onSwap && (
          <button
            type="button"
            onClick={onSwap}
            className="flex min-h-11 items-center self-start font-medium underline underline-offset-4"
          >
            Swap exercise
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={`Dismiss the ${injury.label.toLowerCase()} suggestion`}
        className="-my-2 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center"
      >
        <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}
