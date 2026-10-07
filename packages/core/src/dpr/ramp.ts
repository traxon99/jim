import type { DprDecision } from "./decide";
import { roundToIncrement } from "./equipment-increments";
import { RAMP_MAX_STEPS, RAMP_STEP_PCT } from "./presets";

/**
 * Ramped working sets (issue #385): DPR's weight is the session's top set,
 * and the working sets before it build up to it — e.g. 3 sets at 190 become
 * 170 / 180 / 190 — instead of one flat weight for every set. Each set is
 * RAMP_STEP_PCT lighter than the next, never more than RAMP_MAX_STEPS
 * below the top, rounded to the equipment increment and never decreasing.
 */
export function rampWeights(top: number, count: number, increment: number): number[] {
  if (count <= 0) return [];
  const weights: number[] = [];
  for (let i = 0; i < count; i++) {
    const steps = Math.min(count - 1 - i, RAMP_MAX_STEPS);
    const weight =
      steps === 0 ? top : roundToIncrement(top * (1 - RAMP_STEP_PCT * steps), increment);
    weights.push(Math.min(top, Math.max(weight, weights.at(-1) ?? 0)));
  }
  return weights;
}

/**
 * The suggested weight for each of `count` working sets under a DPR call:
 * ramped up to the call's weight, or flat on a light day (already backed
 * off). Empty when the call has no weight.
 */
export function workingSetWeights(
  decision: Pick<DprDecision, "call" | "weight">,
  count: number,
  increment: number,
): number[] {
  if (decision.weight === null || count <= 0) return [];
  if (decision.call === "light")
    return Array.from({ length: count }, () => decision.weight as number);
  return rampWeights(decision.weight, count, increment);
}
