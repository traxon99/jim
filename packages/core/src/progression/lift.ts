import type { DprSnapshot } from "../dpr/snapshot";
import {
  type ProgressionDecision,
  type ProgressionRule,
  type RoutineTargets,
  decideProgression,
} from "./rules";

export interface ProgressionLiftCall {
  exerciseId: string;
  rule: ProgressionRule;
  decision: ProgressionDecision;
}

/**
 * A custom rule's call for one lift from the same snapshot DPR reads, shared
 * by the web app and the MCP server. Unlike DPR, a rule judges every session
 * of the exercise whatever rep range it was logged at, since its own rep
 * scheme can change (GZCLP's stages).
 */
export function progressionCallForLift(input: {
  snapshot: Pick<DprSnapshot, "history">;
  exerciseId: string;
  rule: ProgressionRule;
  target: RoutineTargets;
  fallbackWeight?: number | null;
  loadStep?: number | null;
}): ProgressionLiftCall {
  const sessions = input.snapshot.history
    .filter((entry) => entry.exerciseId === input.exerciseId)
    .map(({ date, sets, intensity }) => ({ date, sets, intensity }));
  return {
    exerciseId: input.exerciseId,
    rule: input.rule,
    decision: decideProgression({
      rule: input.rule,
      sessions,
      target: input.target,
      fallbackWeight: input.fallbackWeight ?? null,
      loadStep: input.loadStep ?? null,
    }),
  };
}
