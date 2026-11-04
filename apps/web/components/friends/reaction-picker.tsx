"use client";

import { useLongPress } from "@/components/workout/use-long-press";
import { myReaction, reactionTotal } from "@/lib/friends/format";
import type { WorkoutReaction } from "@/lib/friends/types";
import { REACTION_EMOJI, REACTION_KINDS, REACTION_LABELS, type ReactionKind } from "@jim/core";
import { SmilePlus } from "lucide-react";

const ACTION_BUTTON =
  "flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-2 text-sm text-zinc-700 dark:text-zinc-300";

/** React action: smiley-plus or your emoji, with the total count (issue #748). */
export function ReactButton({
  reactions,
  pickerOpen,
  onOpenPicker,
  ariaLabel,
}: {
  reactions: WorkoutReaction[];
  pickerOpen: boolean;
  onOpenPicker: () => void;
  ariaLabel?: string;
}) {
  const mine = myReaction(reactions);
  const total = reactionTotal(reactions);
  const longPress = useLongPress(onOpenPicker);

  return (
    <button
      type="button"
      aria-expanded={pickerOpen}
      aria-label={
        ariaLabel ??
        (mine ? `React, you chose ${REACTION_LABELS[mine]}` : "React") +
          (total > 0 ? `, ${total} reactions` : "")
      }
      onClick={onOpenPicker}
      className={ACTION_BUTTON}
      {...longPress}
    >
      {mine ? (
        <span className="text-xl leading-none" aria-hidden="true">
          {REACTION_EMOJI[mine]}
        </span>
      ) : (
        <SmilePlus className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
      )}
      {total > 0 && <span className="tabular-nums">{total}</span>}
    </button>
  );
}

/** Glass emoji row for the feed and comments (issue #748). */
export function ReactionPicker({
  reactions,
  onPick,
  className = "",
}: {
  reactions: WorkoutReaction[];
  onPick: (kind: ReactionKind) => void;
  className?: string;
}) {
  const mine = myReaction(reactions);
  return (
    <fieldset
      className={`reaction-picker-glass flex list-none gap-0.5 rounded-full p-1 ${className}`}
    >
      <legend className="sr-only">Pick a reaction</legend>
      {REACTION_KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          aria-pressed={mine === kind}
          aria-label={REACTION_LABELS[kind]}
          onClick={() => onPick(kind)}
          className={`flex min-h-11 min-w-11 items-center justify-center rounded-full text-2xl ${
            mine === kind ? "bg-white/80 dark:bg-zinc-800/80" : ""
          }`}
        >
          {REACTION_EMOJI[kind]}
        </button>
      ))}
    </fieldset>
  );
}
