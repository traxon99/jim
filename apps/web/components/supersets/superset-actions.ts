import type { ExerciseAction } from "@/components/exercise-actions-menu";
import {
  type SupersetChange,
  type SupersetItem,
  leaveSuperset,
  setSupersetLink,
  supersetLinks,
} from "@jim/core";

/**
 * The superset entries for the ⋯ menu of the exercise at `index` (issue
 * #269): link it with a neighbour, or take it out of its superset.
 */
export function supersetActions(
  items: readonly SupersetItem[],
  index: number,
  apply: (changes: readonly SupersetChange[]) => void,
): ExerciseAction[] {
  const links = supersetLinks(items);
  const linkedToPrevious = index > 0 && links[index - 1] === true;
  const linkedToNext = links[index] === true;
  const actions: ExerciseAction[] = [];
  if (index > 0 && !linkedToPrevious) {
    actions.push({
      label: "Superset with previous",
      onSelect: () => apply(setSupersetLink(items, index - 1, true)),
    });
  }
  if (index < items.length - 1 && !linkedToNext) {
    actions.push({
      label: "Superset with next",
      onSelect: () => apply(setSupersetLink(items, index, true)),
    });
  }
  if (linkedToPrevious || linkedToNext) {
    actions.push({
      label: "Remove from superset",
      onSelect: () => apply(leaveSuperset(items, index)),
    });
  }
  return actions;
}

/** The ⋯ menu's Remove entry, always last. */
export function removeExerciseAction(onRemove: () => void): ExerciseAction {
  return { label: "Remove exercise", onSelect: onRemove, destructive: true };
}
