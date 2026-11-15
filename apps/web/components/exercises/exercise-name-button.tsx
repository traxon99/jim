"use client";

import { ExerciseDetail } from "@/components/exercises/exercise-detail";
import Link from "next/link";
import { type FocusEvent, type ReactNode, useState } from "react";

function stopPropagation(event: FocusEvent) {
  event.stopPropagation();
}

/**
 * An exercise's name wherever a list shows it (issue #796): tapping it opens
 * the exercise card in place, over whatever screen it was tapped on, so a
 * routine's edits, the workout summary or a sheet underneath stay put.
 *
 * `portal` renders a link to the desktop portal's exercise page instead,
 * since the portal has no local database for the card to read.
 */
export function ExerciseNameButton({
  exerciseId,
  userId,
  portal = false,
  className = "",
  children,
}: {
  exerciseId: string;
  userId: string;
  portal?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (portal) {
    return (
      <Link
        href={`/portal/exercises/${exerciseId}`}
        className={`underline-offset-4 hover:underline ${className}`}
      >
        {children}
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`min-w-0 max-w-full text-left underline-offset-4 hover:underline ${className}`}
      >
        {children}
      </button>
      {open && (
        // The card is portaled, but React still bubbles its focus events up
        // this tree: a routine row would read them as the user editing it and
        // stop taking synced edits (#519, #796).
        <span className="contents" onFocus={stopPropagation} onBlur={stopPropagation}>
          <ExerciseDetail id={exerciseId} userId={userId} onClose={() => setOpen(false)} />
        </span>
      )}
    </>
  );
}
