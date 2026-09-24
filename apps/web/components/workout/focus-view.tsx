"use client";

import { type FocusExerciseCandidate, isFocusExerciseComplete } from "@jim/core";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { type ReactNode, useEffect } from "react";

export interface FocusViewExercise extends FocusExerciseCandidate {
  id: string;
  name: string;
}

interface Props {
  title: string;
  /** Shown before the title — the session's routine icon, if any. */
  titleIcon?: React.ReactNode;
  exercises: readonly FocusViewExercise[];
  index: number;
  onIndexChange: (index: number) => void;
  onExit: () => void;
  /** Right side of the top bar — the workout's Finish button. */
  headerAction?: ReactNode;
  /** Pinned just above the prev/next controls — the rest timer. */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * One-exercise-at-a-time workout view (issue #144): a full-screen overlay
 * that covers the tab bar until exited, with a fixed top bar (exit, title,
 * finish), a tappable step strip showing which exercises are done, set
 * progress for the current one, and big prev/next controls pinned to the
 * bottom so the lifter never has to hunt for them mid-set.
 */
export function FocusView({
  title,
  titleIcon,
  exercises,
  index,
  onIndexChange,
  onExit,
  headerAction,
  footer,
  children,
}: Props) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onExit();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onExit]);

  const current = exercises[index];
  if (!current) return null;
  const next = exercises[index + 1];
  const isFirst = index === 0;
  const isLast = index === exercises.length - 1;
  const doneCount = exercises.filter(isFocusExerciseComplete).length;
  const setGoal = current.targetSetCount;
  const setProgress =
    setGoal != null && setGoal > 0 ? Math.min(1, current.loggedSetCount / setGoal) : null;
  const currentComplete = isFocusExerciseComplete(current);

  return (
    <section
      aria-label="Focus view"
      className="fixed inset-0 z-20 flex flex-col bg-white text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-2 py-2 dark:border-zinc-800">
        <button
          type="button"
          onClick={onExit}
          aria-label="Exit focus view"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-zinc-600 dark:text-zinc-300"
        >
          <X className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="flex items-center justify-center gap-1.5 text-base font-semibold">
            {titleIcon}
            <span className="truncate">{title}</span>
          </p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Exercise {index + 1} of {exercises.length} · {doneCount} done
          </p>
        </div>
        <div className="flex min-w-11 shrink-0 justify-end">{headerAction}</div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-3">
        <ol className="flex gap-1.5" aria-label="Exercises">
          {exercises.map((exercise, i) => {
            const complete = isFocusExerciseComplete(exercise);
            const active = i === index;
            return (
              <li key={exercise.id} className="flex-1">
                <button
                  type="button"
                  onClick={() => onIndexChange(i)}
                  aria-label={`Go to ${exercise.name}${complete ? " (done)" : ""}`}
                  aria-current={active ? "step" : undefined}
                  className="flex min-h-11 w-full items-center justify-center"
                >
                  <span
                    className={`block w-full rounded-full transition-colors ${
                      active
                        ? "h-3 bg-accent"
                        : complete
                          ? "h-2 bg-emerald-500 dark:bg-emerald-400"
                          : "h-2 bg-zinc-300 dark:bg-zinc-700"
                    }`}
                  />
                </button>
              </li>
            );
          })}
        </ol>

        <div className="flex flex-col gap-2 rounded-xl bg-zinc-100 p-3 dark:bg-zinc-900">
          <div className="flex items-center justify-between gap-2">
            <span className="text-lg font-semibold tabular-nums">
              {current.loggedSetCount}
              {setGoal != null ? ` of ${setGoal}` : ""}{" "}
              {(setGoal ?? current.loggedSetCount) === 1 ? "set" : "sets"} logged
            </span>
            {currentComplete && (
              <span className="flex items-center gap-1 text-base font-semibold text-emerald-600 dark:text-emerald-400">
                <Check className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
                Done
              </span>
            )}
          </div>
          {setProgress != null && (
            <div
              className="h-2 overflow-hidden rounded-full bg-zinc-300 dark:bg-zinc-700"
              aria-hidden="true"
            >
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width] dark:bg-emerald-400"
                style={{ width: `${setProgress * 100}%` }}
              />
            </div>
          )}
        </div>

        {children}
      </div>

      {footer}

      <nav
        aria-label="Exercise navigation"
        className="flex shrink-0 gap-2 border-t border-zinc-200 px-4 pt-3 dark:border-zinc-800"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={() => onIndexChange(index - 1)}
          disabled={isFirst}
          aria-label="Previous exercise"
          className="flex min-h-14 min-w-14 items-center justify-center rounded-xl border border-zinc-300 disabled:opacity-40 dark:border-zinc-700"
        >
          <ChevronLeft className="h-7 w-7" strokeWidth={2} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onIndexChange(index + 1)}
          disabled={isLast}
          className="flex min-h-14 flex-1 items-center justify-between gap-2 rounded-xl bg-accent px-4 text-left text-accent-foreground disabled:opacity-40"
        >
          <span className="flex min-w-0 flex-col">
            <span className="text-xs font-semibold uppercase tracking-wide opacity-80">
              {next ? "Up next" : "Last exercise"}
            </span>
            <span className="truncate text-lg font-semibold">
              {next ? next.name : "Finish when you're ready"}
            </span>
          </span>
          {next && <ChevronRight className="h-7 w-7 shrink-0" strokeWidth={2} aria-hidden="true" />}
        </button>
      </nav>
    </section>
  );
}
