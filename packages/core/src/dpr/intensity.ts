import type { DprDecision, SessionIntensity } from "./decide";
import { roundToIncrement } from "./equipment-increments";
import { LIGHT_DAY_PCT } from "./presets";

/**
 * "How hard do you want to push today?" (issue #235): a DPR user's pick on
 * the pre-workout sheet, stored on the session, bends that one session's
 * calls. It never changes what DPR decides next time — a light session is
 * left out of the decision history (see `decideNextWeight`), and maintain
 * and push sessions are judged like any other.
 */

export const SESSION_INTENSITIES: readonly SessionIntensity[] = ["light", "maintain", "push"];

// Push takes PRP's call as is, so starting from the pre-workout sheet follows
// PRP unless the user picks otherwise (issue #454).
export const DEFAULT_SESSION_INTENSITY: SessionIntensity = "push";

export const SESSION_INTENSITY_LABELS: Readonly<Record<SessionIntensity, string>> = {
  light: "Go light",
  maintain: "Maintain",
  push: "Push",
};

export const SESSION_INTENSITY_DESCRIPTIONS: Readonly<Record<SessionIntensity, string>> = {
  light: `About ${Math.round(LIGHT_DAY_PCT * 100)}% lighter — won't count against progression`,
  maintain: "Repeat last session's weights, no progression attempt",
  push: "Take PRP's progression call",
};

function formatWeight(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/**
 * DPR's call for one lift, adjusted for the session's intensity. Null (no
 * pick) and "push" leave the call as is. Deloads, re-entries and calls that
 * still need RPE are never made heavier.
 */
export function applyIntensity(
  decision: DprDecision,
  intensity: SessionIntensity | null | undefined,
  increment: number,
): DprDecision {
  if (!intensity || intensity === "push") return decision;

  if (intensity === "maintain") {
    if (decision.call !== "increase" || decision.previousWeight === null) return decision;
    return {
      ...decision,
      call: "hold",
      weight: decision.previousWeight,
      targetReps: null,
      reason: "Maintain day — repeating last session's weight",
    };
  }

  if (decision.call === "insufficient" && decision.previousWeight === null) return decision;
  const candidates = [decision.weight, decision.previousWeight].filter(
    (w): w is number => w !== null,
  );
  if (candidates.length === 0) return decision;
  const from = Math.min(...candidates);
  const weight = roundToIncrement(from * (1 - LIGHT_DAY_PCT), increment, "down");
  return {
    ...decision,
    call: "light",
    weight,
    previousWeight: decision.previousWeight ?? from,
    targetReps: null,
    reason: `Light day — ${formatWeight(weight)} instead of ${formatWeight(from)}`,
    streak: 0,
  };
}
