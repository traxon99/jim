"use client";

import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A small viewport-centered dialog with a backdrop, for the ⋯ menu's sticky
 * note and rest timer (issue #271). Fixed and centered, so it can never widen
 * the page (docs/PWA.md §3); z-30 beats the rest timer bar (z-10) and Focus
 * view (z-20), which it can open over.
 *
 * Portaled to <body>: it's opened from inside an exercise's section, where
 * the rows after it could paint over it (docs/PWA.md §4, issue #493).
 */
export function ExerciseDialog({ title, onClose, children }: Props) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

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

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="sheet-backdrop fixed inset-0 z-30 flex items-center justify-center overscroll-none bg-black/50 px-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        // `absolute!`: globals.css gives every enabled button `position: relative`
        // for the tap ripple, which beats plain `absolute` and left this backdrop
        // a zero-size flex item that ignored taps (#356, #493).
        className="absolute! inset-0 cursor-default touch-none"
      />
      <dialog
        open
        aria-modal="true"
        aria-label={title}
        className="sheet-panel relative m-0 flex w-full max-w-sm flex-col gap-4 rounded-xl border-0 bg-white p-4 text-zinc-950 shadow-xl dark:bg-zinc-900 dark:text-zinc-50"
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        {children}
      </dialog>
    </div>,
    document.body,
  );
}
