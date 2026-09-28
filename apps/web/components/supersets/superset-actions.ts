import type { ExerciseAction } from "@/components/exercise-actions-menu";
import {
  type SupersetChange,
  type SupersetItem,
  leaveSuperset,
  setSupersetLink,
  supersetLinks,
} from "@jim/core";
import { Eye, Pencil, SlidersVertical, TextQuote, Undo2, Unlink, X } from "lucide-react";

/**
 * The superset entries for the ⋯ menu of the exercise at `index` (issues
 * #269, #271): Create Superset links it with the next exercise (or the
 * previous one, for the last), and Remove from Superset takes it out.
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
  if (index < items.length - 1 && !linkedToNext) {
    actions.push({
      label: "Create Superset",
      icon: TextQuote,
      onSelect: () => apply(setSupersetLink(items, index, true)),
    });
  } else if (index > 0 && !linkedToPrevious) {
    actions.push({
      label: "Create Superset",
      icon: TextQuote,
      onSelect: () => apply(setSupersetLink(items, index - 1, true)),
    });
  }
  if (linkedToPrevious || linkedToNext) {
    actions.push({
      label: "Remove from Superset",
      icon: Unlink,
      onSelect: () => apply(leaveSuperset(items, index)),
    });
  }
  return actions;
}

/** Swap this exercise for another, through the picker. */
export function replaceExerciseAction(onReplace: () => void): ExerciseAction {
  return { label: "Replace Exercise", icon: Undo2, onSelect: onReplace };
}

/** The Preferences › submenu: the exercise's own page and its edit form. */
export function preferencesAction(
  exerciseId: string,
  navigate: (href: string) => void,
): ExerciseAction {
  return {
    label: "Preferences",
    icon: SlidersVertical,
    submenu: [
      {
        label: "View Exercise",
        icon: Eye,
        onSelect: () => navigate(`/exercises/${exerciseId}`),
      },
      {
        label: "Edit Exercise",
        icon: Pencil,
        onSelect: () => navigate(`/exercises/${exerciseId}/edit`),
      },
    ],
  };
}

/** The ⋯ menu's Remove entry, always last. */
export function removeExerciseAction(onRemove: () => void): ExerciseAction {
  return { label: "Remove Exercise", icon: X, onSelect: onRemove, destructive: true };
}
