"use client";

import { ChevronLeft, ChevronRight, type LucideIcon, MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface ExerciseAction {
  label: string;
  icon: LucideIcon;
  /** Runs on tap. Omitted for an entry that only opens `submenu`. */
  onSelect?: () => void;
  /** Entries shown in place of the menu, with a back row, when tapped. */
  submenu?: readonly ExerciseAction[];
  destructive?: boolean;
}

interface Props {
  actions: readonly ExerciseAction[];
  /** Bigger trigger for focus view. */
  large?: boolean;
}

/**
 * The ⋯ menu at the top right of an exercise (issues #269, #271): notes,
 * warm-ups, rest, replace, superset, preferences and Remove, each with a
 * blue icon. It sits at the right edge, so it opens leftward (docs/PWA.md).
 */
export function ExerciseActionsMenu({ actions, large = false }: Props) {
  const [open, setOpen] = useState(false);
  const [submenuLabel, setSubmenuLabel] = useState<string | null>(null);
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

  useEffect(() => {
    if (!open) setSubmenuLabel(null);
  }, [open]);

  const submenu = actions.find((action) => action.label === submenuLabel)?.submenu ?? null;
  const shown = submenu ?? actions;

  function handleSelect(action: ExerciseAction) {
    if (action.submenu) {
      setSubmenuLabel(action.label);
      return;
    }
    setOpen(false);
    action.onSelect?.();
  }

  const itemClass =
    "flex min-h-12 w-full items-center gap-3 px-4 text-left text-base font-semibold";

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
          className="absolute right-0 top-full z-10 mt-1 flex max-h-[calc(100vh-2rem)] w-64 max-w-[calc(100vw-2rem)] flex-col overflow-y-auto rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
        >
          {submenu && (
            <button
              type="button"
              role="menuitem"
              onClick={() => setSubmenuLabel(null)}
              className={`${itemClass} border-b border-zinc-200 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400`}
            >
              <ChevronLeft className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden="true" />
              {submenuLabel}
            </button>
          )}
          {shown.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                aria-haspopup={action.submenu ? "menu" : undefined}
                onClick={() => handleSelect(action)}
                className={`${itemClass} text-zinc-950 dark:text-zinc-50`}
              >
                <Icon
                  className={`h-5 w-5 shrink-0 ${action.destructive ? "text-red-500" : "text-accent"}`}
                  strokeWidth={2}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">{action.label}</span>
                {action.submenu && (
                  <ChevronRight
                    className="h-5 w-5 shrink-0 text-accent"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
