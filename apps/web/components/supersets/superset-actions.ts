import type { ExerciseAction } from "@/components/exercise-actions-menu";
import {
  type SupersetChange,
  type SupersetItem,
  leaveSuperset,
  supersetBlocks,
  supersetLinks,
} from "@jim/core";
import { Eye, Pencil, SlidersVertical, TextQuote, Undo2, Unlink, X } from "lucide-react";

/**
 * The superset entries for the ⋯ menu of the exercise at `index` (issues
 * #269, #271, #360): Create Superset (or Edit Superset, once it's in one)
 * opens the card to pick the rest of the superset, and Remove from Superset
 * takes it out.
 */
export function supersetActions(
  items: readonly SupersetItem[],
  index: number,
  apply: (changes: readonly SupersetChange[]) => void,
  openPicker: () => void,
): ExerciseAction[] {
  if (items.length < 2) return [];
  const links = supersetLinks(items);
  const inSuperset = (index > 0 && links[index - 1] === true) || links[index] === true;
  if (!inSuperset) {
    return [{ label: "Create Superset", icon: TextQuote, onSelect: openPicker }];
  }
  return [
    { label: "Edit Superset", icon: TextQuote, onSelect: openPicker },
    {
      label: "Remove from Superset",
      icon: Unlink,
      onSelect: () => apply(leaveSuperset(items, index)),
    },
  ];
}

/**
 * Who the superset card opens with picked: the exercise's superset, or just
 * the exercise itself.
 */
export function supersetMemberIds(items: readonly SupersetItem[], id: string): string[] {
  const block = supersetBlocks(items).find((b) => b.items.some((item) => item.id === id));
  return block?.letter ? block.items.map((item) => item.id) : [id];
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
