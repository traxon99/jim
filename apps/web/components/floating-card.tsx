"use client";

import { type AnimationEvent, type ReactNode, useCallback, useEffect, useState } from "react";

interface Props {
  /** Id of the card's heading, for aria-labelledby. */
  labelledBy: string;
  onClose: () => void;
  /** Gets `close`, which plays the exit fade before calling onClose. */
  children: (close: () => void) => ReactNode;
}

/**
 * A card floating centered over the blurred page (issue #278): the shell of
 * the pre-workout sheet and the DPR details card (issue #284). Tapping the
 * backdrop or pressing Escape closes it.
 */
export function FloatingCard({ labelledBy, onClose, children }: Props) {
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

  return (
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
        className="absolute inset-0 touch-none"
      />
      <section
        aria-labelledby={labelledBy}
        className="sheet-panel relative flex max-h-full min-h-0 w-full max-w-md flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        {children(requestClose)}
      </section>
    </div>
  );
}
