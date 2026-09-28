"use client";

import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface ExerciseAction {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
}

interface Props {
  actions: readonly ExerciseAction[];
  /** Bigger trigger for focus view. */
  large?: boolean;
}

/**
 * The ⋯ menu at the top right of an exercise (issue #269): superset options
 * and Remove. It sits at the right edge, so it opens leftward (docs/PWA.md).
 */
export function ExerciseActionsMenu({ actions, large = false }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Exercise options"
        className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-zinc-500 dark:text-zinc-400"
      >
        <MoreHorizontal
          className={large ? "h-6 w-6" : "h-5 w-5"}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-10 mt-1 flex min-w-44 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-md border border-zinc-200 bg-white py-1 shadow-md dark:border-zinc-700 dark:bg-zinc-900"
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                action.onSelect();
              }}
              className={`min-h-11 px-3 text-left text-sm ${
                action.destructive
                  ? "text-red-600 dark:text-red-500"
                  : "text-zinc-700 dark:text-zinc-300"
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
