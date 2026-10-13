"use client";

import { Undo2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

/** How long an Undo stays up after a delete (issue #318, #520). */
export const UNDO_MS = 8000;

/**
 * The thing just deleted, while its Undo is offered (#520: every list delete
 * gets the strength section's Undo). `offer` replaces any earlier one; `take`
 * hands it back once and clears it, so a double tap can't restore twice.
 */
export function useUndoable<T>() {
  const [pending, setPending] = useState<{ label: string; value: T } | null>(null);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setPending(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  const offer = useCallback((label: string, value: T) => setPending({ label, value }), []);
  const take = useCallback((): T | null => {
    const value = pending?.value ?? null;
    setPending(null);
    return value;
  }, [pending]);

  return { label: pending?.label ?? null, offer, take };
}

export function UndoBar({ label, onUndo }: { label: string; onUndo: () => void }) {
  return (
    <output className="flex items-center justify-between gap-2 rounded-lg bg-zinc-100 px-3 py-1 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
      <span>{label}</span>
      <button
        type="button"
        onClick={onUndo}
        aria-label="Undo delete"
        className="flex min-h-11 min-w-11 items-center justify-center text-accent"
      >
        <Undo2 className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
      </button>
    </output>
  );
}
