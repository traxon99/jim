"use client";

import { type ReactNode, useEffect } from "react";

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
 */
export function ExerciseDialog({ title, onClose, children }: Props) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30 flex touch-none items-center justify-center overscroll-none bg-black/50 px-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <dialog
        open
        aria-modal="true"
        aria-label={title}
        className="relative m-0 flex w-full max-w-sm flex-col gap-4 rounded-xl border-0 bg-white p-4 text-zinc-950 shadow-xl dark:bg-zinc-900 dark:text-zinc-50"
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        {children}
      </dialog>
    </div>
  );
}
