"use client";

import { type TempoGroup, saveLiftTempos } from "@/lib/routines/tempo-groups";
import { sharedTempo } from "@jim/core";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { RoutineIcon } from "./routine-icon";
import { TempoField } from "./tempo-field";

/**
 * Every lift's tempo for a routine or a program, set in one place (issue
 * #850). All lifts sets the same tempo on each; each lift can then differ.
 * A tempo saves as focus leaves its inputs, like the field it reuses, so
 * Done only closes. Same full-screen overlay as Reorder exercises
 * (docs/PWA.md §2).
 */
export function TempoSheet({
  title,
  groups,
  showRoutineNames,
  onClose,
}: {
  /** The routine's or program's name, under "Tempo". */
  title: string;
  groups: readonly TempoGroup[];
  /** A program's sheet heads each routine's lifts with its name. */
  showRoutineNames: boolean;
  onClose: () => void;
}) {
  const lifts = groups.flatMap((group) => group.lifts);
  const all = sharedTempo(lifts.map((lift) => lift.item.tempo));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Same lock as Focus view: `fixed` alone leaves the page behind scrollable.
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

  return createPortal(
    // z-30, like Reorder exercises: above the rest timer bar and tab bar.
    <section
      aria-label="Tempo"
      className="route-fade safe-x fixed inset-0 z-30 flex flex-col overscroll-none bg-white text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50"
      style={{ paddingTop: "var(--top-inset)" }}
    >
      <header className="flex shrink-0 touch-none items-center justify-between gap-2 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Tempo</h2>
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-500">{title}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 shrink-0 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground"
        >
          Done
        </button>
      </header>

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
      >
        <div className="flex flex-col gap-4">
          {lifts.length > 1 && (
            <div className="rounded-lg border border-zinc-200 px-3 py-3 dark:border-zinc-800">
              <TempoField
                label="All lifts"
                clearLabel="Clear tempo for all lifts"
                value={all.kind === "same" ? all.tempo : null}
                onCommit={(tempo) =>
                  void saveLiftTempos(
                    lifts.map((lift) => lift.item),
                    tempo,
                  )
                }
              />
            </div>
          )}

          {groups.map((group) => (
            <section
              key={group.routine.id}
              aria-label={group.routine.name}
              className="flex flex-col gap-2"
            >
              {showRoutineNames && (
                <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                  <RoutineIcon
                    shape={group.routine.iconShape}
                    color={group.routine.iconColor}
                    className="h-4 w-4 shrink-0"
                  />
                  <span className="min-w-0 truncate">{group.routine.name}</span>
                </h3>
              )}
              <ul className="flex flex-col divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {group.lifts.map((lift) => (
                  <li key={lift.item.id} className="px-3 py-3">
                    <TempoField
                      label={lift.name}
                      clearLabel={`Clear tempo for ${lift.name}`}
                      value={lift.item.tempo}
                      onCommit={(tempo) => void saveLiftTempos([lift.item], tempo)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </section>,
    document.body,
  );
}
