"use client";

import type { SetRow } from "@/lib/db/schema";
import { SET_KINDS, type SetKind, setKindLabel } from "@/lib/sessions/set-kinds";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Props {
  /** The set's number, or "W" for a warm-up (see `setNumberLabels`). */
  label: string;
  kind: SetRow["kind"];
  onChange: (kind: SetKind) => void;
  large?: boolean;
}

/**
 * Set #N, opened into a menu for picking its type (issue #161) — replaces the
 * old always-visible "Kind" column/field. Warm-ups show a yellow W instead of
 * a number (issue #220).
 */
export function SetKindMenu({ label, kind, onChange, large = false }: Props) {
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

  const isWarmup = kind === "warmup";
  // The W already says "warm-up"; other non-working kinds get a subtitle.
  const subtitle = kind !== "working" && !isWarmup ? setKindLabel(kind) : null;
  const warmupClass = "font-bold text-amber-500 dark:text-amber-400";

  return (
    <div ref={rootRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={
          large
            ? "flex items-center gap-1 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
            : "flex flex-col items-start gap-0 rounded px-0.5 py-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-500"
        }
      >
        {large ? (
          <>
            {isWarmup ? (
              <span className={warmupClass}>Warm-up</span>
            ) : (
              <span>
                Set {label}
                {subtitle ? ` · ${subtitle}` : ""}
              </span>
            )}
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          </>
        ) : (
          <>
            <span
              className={`flex items-center gap-0.5 ${isWarmup ? warmupClass : ""}`}
              aria-label={isWarmup ? "Warm-up set" : `Set ${label}`}
            >
              {label}
              <ChevronDown className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
            </span>
            {subtitle && (
              <span className="text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
                {subtitle}
              </span>
            )}
          </>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-10 mt-1 flex min-w-28 flex-col overflow-hidden rounded-md border border-zinc-200 bg-white py-1 shadow-md dark:border-zinc-700 dark:bg-zinc-900"
        >
          {SET_KINDS.map((option) => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={option === kind}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
              className={
                option === kind
                  ? "px-3 py-2 text-left text-sm font-medium text-accent"
                  : "px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300"
              }
            >
              {setKindLabel(option)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
