"use client";

import { Trophy } from "@/components/icons/solar";
import type { CardioKind } from "@jim/core";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface CardioRecordToastData {
  /** The set that beat it, so a second record restarts the toast. */
  key: string;
  /** "Fastest 5K · 26:05". */
  title: string;
  /** "was 26:41", or null for a record with nothing before it. */
  detail: string | null;
  sport: CardioKind;
}

/** How long the toast stays up before it slides away. */
const SHOW_MS = 4000;
/** Matches .record-toast-out in globals.css (20% shorter than the entrance). */
const EXIT_MS = 190;

/**
 * A cardio set that beats a record (issue #872) drops a gold banner from the
 * top of the screen, clear of the rest timer pill at the bottom, and slides
 * back up after a few seconds. Unmounting runs on a timer rather than
 * `animationend`, so it still goes away with reduced motion (docs/PWA.md §7).
 */
export function CardioRecordToast({
  toast,
  onDone,
}: {
  toast: CardioRecordToastData;
  onDone: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // A new record (new key) restarts the clock.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the key is what restarts it.
  useEffect(() => {
    setLeaving(false);
    const leave = window.setTimeout(() => setLeaving(true), SHOW_MS);
    const done = window.setTimeout(() => onDoneRef.current(), SHOW_MS + EXIT_MS);
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(done);
    };
  }, [toast.key]);

  // Portaled to <body>, so a transformed ancestor (the reorder drag) can't
  // turn `fixed` into a box inside the card.
  return createPortal(
    <output
      aria-live="polite"
      className="safe-x pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4"
      style={{ top: "calc(var(--top-inset) + 8px)" }}
    >
      <div
        key={toast.key}
        className={`surface pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-3xl px-3 py-2.5 shadow-lg ${
          leaving ? "record-toast-out" : "record-toast-in"
        }`}
      >
        <span className="record-medal flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-amber-900">
          <Trophy className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-amber-600 uppercase dark:text-amber-400">
            New record
          </p>
          <p className="truncate text-[17px] font-bold tabular-nums">{toast.title}</p>
          {toast.detail && (
            <p className="truncate text-sm text-zinc-500 tabular-nums">{toast.detail}</p>
          )}
        </div>
      </div>
    </output>,
    document.body,
  );
}
