import {
  type ProgressionRule,
  currentBlockOf,
  customRuleConflict,
  parseProgressionRule,
} from "@jim/core";
import { type DbOrTx, dprBlockLifts, dprBlocks, users } from "@jim/db";
import { eq } from "drizzle-orm";

export class ProgressionRuleError extends Error {}

/**
 * Validates the custom progression rules (issue #255) a routine write sets,
 * one exercise at a time. ADR-016 allows one automatic progression per
 * lift, so a rule on a lift DPR is focusing on is refused rather than
 * silently overriding it. DPR's focus is read once, on the first rule.
 */
export function progressionRuleChecker(tx: DbOrTx, userId: string) {
  let focused: Promise<Set<string>> | null = null;

  async function loadFocused(): Promise<Set<string>> {
    const [user] = await tx.select().from(users).where(eq(users.id, userId));
    if (!user?.dprEnabled) return new Set();
    const block = currentBlockOf(await tx.select().from(dprBlocks));
    if (!block) return new Set();
    const lifts = await tx.select().from(dprBlockLifts).where(eq(dprBlockLifts.blockId, block.id));
    return new Set(lifts.filter((lift) => !lift.deletedAt).map((lift) => lift.exerciseId));
  }

  return async function check(
    value: unknown,
    exercise: { id: string; name: string },
  ): Promise<ProgressionRule | null> {
    if (value == null) return null;
    const rule = parseProgressionRule(value);
    if (!rule) throw new ProgressionRuleError(`${exercise.name}: invalid progression rule.`);
    focused ??= loadFocused();
    const conflict = customRuleConflict({ dprFocused: (await focused).has(exercise.id) });
    if (conflict) throw new ProgressionRuleError(`${exercise.name}: ${conflict}`);
    return rule;
  };
}
