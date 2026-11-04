"use client";

import { useLongPress } from "@/components/workout/use-long-press";
import { myReaction, reactionTotal } from "@/lib/friends/format";
import { popoverPosition } from "@/lib/friends/popover-position";
import type { WorkoutReaction } from "@/lib/friends/types";
import { REACTION_EMOJI, REACTION_KINDS, REACTION_LABELS, type ReactionKind } from "@jim/core";
import { SmilePlus } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const ACTION_BUTTON =
  "flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-2 text-sm text-zinc-700 dark:text-zinc-300";

/**
 * React action: smiley-plus or your emoji, with the total count (issue #748).
 * A tap or long press opens the reaction picker floating above it, over the
 * page rather than pushing it down.
 */
export function ReactButton({
  reactions,
  pickerOpen,
  onOpenPicker,
  onClosePicker,
  onPick,
  ariaLabel,
}: {
  reactions: WorkoutReaction[];
  pickerOpen: boolean;
  /** Toggles the picker. */
  onOpenPicker: () => void;
  onClosePicker: () => void;
  onPick: (kind: ReactionKind) => void;
  ariaLabel?: string;
}) {
  const mine = myReaction(reactions);
  const total = reactionTotal(reactions);
  const longPress = useLongPress(onOpenPicker);
  const anchor = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-expanded={pickerOpen}
        aria-haspopup="true"
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
      {pickerOpen && (
        <ReactionPopover
          anchor={anchor}
          reactions={reactions}
          onPick={onPick}
          onClose={onClosePicker}
        />
      )}
    </>
  );
}

/**
 * The glass emoji row, floating just above its button (below it when there's
 * no room above). Portaled to <body> and `fixed`, so it can't grow the page
 * or be painted over by a later post (docs/PWA.md §3, §4). z-40: above the
 * comments sheet (z-30), which opens it too. Closes on a pick, a tap
 * elsewhere, Escape or any scroll.
 */
function ReactionPopover({
  anchor,
  reactions,
  onPick,
  onClose,
}: {
  anchor: React.RefObject<HTMLElement | null>;
  reactions: WorkoutReaction[];
  onPick: (kind: ReactionKind) => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const button = anchor.current?.getBoundingClientRect();
    const own = panel.current;
    if (!button || !own) return;
    setPosition(
      popoverPosition(
        button,
        { width: own.offsetWidth, height: own.offsetHeight },
        {
          width: window.innerWidth,
          height: window.innerHeight,
        },
      ),
    );
  }, [anchor]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      // The button toggles the picker itself.
      if (panel.current?.contains(target) || anchor.current?.contains(target)) return;
      onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function onScroll(event: Event) {
      if (event.target instanceof Node && panel.current?.contains(event.target)) return;
      onClose();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onClose);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={panel}
      className="reaction-popover fixed z-40"
      style={
        position
          ? { top: position.top, left: position.left }
          : { top: 0, left: 0, visibility: "hidden" }
      }
    >
      <ReactionPicker reactions={reactions} onPick={onPick} />
    </div>,
    document.body,
  );
}

/** The six emoji in a glass pill; picking your own again takes it back. */
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
          className={`reaction-picker-emoji flex min-h-11 min-w-11 items-center justify-center rounded-full text-[26px] ${
            mine === kind ? "bg-black/10 dark:bg-white/15" : ""
          }`}
        >
          {REACTION_EMOJI[kind]}
        </button>
      ))}
    </fieldset>
  );
}
