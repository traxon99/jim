"use client";

import type { RoutineIconColor } from "@jim/core";
import { type AnimationEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  /** Id of the card's heading, for aria-labelledby. */
  labelledBy: string;
  onClose: () => void;
  /**
   * A routine icon color to glow under the card when the frosted glass card
   * style is on (globals.css `.tinted-card`, issue #374).
   */
  tint?: RoutineIconColor;
  /** Gets `close`, which plays the exit fade before calling onClose. */
  children: (close: () => void) => ReactNode;
}

/**
 * A card floating centered over the blurred page (issue #278): the shell of
 * the pre-workout sheet and the DPR details card (issue #284). Tapping the
 * backdrop or pressing Escape closes it.
 *
 * Portaled to <body> so it never depends on where it's rendered from: the DPR
 * card opened from a routine row was trapped under the rows after it, which
 * painted straight through the card (docs/PWA.md §4, issue #387).
 */
export function FloatingCard({ labelledBy, onClose, tint, children }: Props) {
  // Closing plays the exit fade (globals.css .sheet-backdrop) before handing
  // control back; reduced motion skips straight to onClose, since no
  // animationend would ever fire.
  const [closing, setClosing] = useState(false);
  const requestClose = useCallback(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) onClose();
    else setClosing(true);
  }, [onClose]);
  const handleAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (closing && event.target === event.currentTarget) onClose();
  };
  // Backstop: a missed animationend (iOS drops it when the animation is
  // interrupted) left the card up until a second tap. The exit is 160ms.
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(onClose, 400);
    return () => clearTimeout(timer);
  }, [closing, onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [requestClose]);

  // `fixed` doesn't stop the page underneath from scrolling (docs/PWA.md §2).
  useEffect(() => {
    const html = document.documentElement;
    const { body } = document;
    const previous = { html: html.style.overflow, body: body.style.overflow };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = previous.html;
      body.style.overflow = previous.body;
    };
  }, []);

  // Portals need the DOM, so the card appears once mounted (it's only ever
  // opened by a tap or a client-side route, so there's no visible delay).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    // z-20: a full-screen overlay, above the tab bar and in-flow chrome
    // (docs/PWA.md §4). Only shown from the Workout tab, never alongside
    // FocusView or the exercise picker. The card floats centered, inset from
    // every edge so the blurred page stays visible around it (issue #278).
    <div
      data-closing={closing}
      onAnimationEnd={handleAnimationEnd}
      className="sheet-backdrop fixed inset-0 z-20 flex items-center justify-center overscroll-none bg-black/30 px-4 backdrop-blur-sm"
      style={{
        paddingTop: "max(16px, env(safe-area-inset-top))",
        paddingBottom: "max(16px, env(safe-area-inset-bottom))",
      }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={requestClose}
        // `absolute!`: globals.css gives every enabled button `position: relative`
        // (for the tap ripple), and unlayered CSS beats the utilities layer, so
        // plain `absolute` left this a zero-size flex item and backdrop taps did nothing.
        className="absolute! inset-0 touch-none"
      />
      <section
        aria-labelledby={labelledBy}
        data-tint={tint}
        className={`sheet-panel relative flex max-h-full min-h-0 w-full max-w-md flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 ${
          tint ? "tinted-card" : ""
        }`}
      >
        {children(requestClose)}
      </section>
    </div>,
    document.body,
  );
}
