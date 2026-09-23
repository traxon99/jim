"use client";

import { type FocusExerciseCandidate, isFocusExerciseComplete } from "@jim/core";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export interface FocusViewExercise extends FocusExerciseCandidate {
  id: string;
  name: string;
}

interface Props {
  exercises: readonly FocusViewExercise[];
  index: number;
  onIndexChange: (index: number) => void;
  children: ReactNode;
}

/**
 * One-exercise-at-a-time workout view: a tappable step strip showing which
 * exercises are done, set progress for the current one, and big prev/next
 * controls so the lifter never has to scroll mid-set.
 */
export function FocusView({ exercises, index, onIndexChange, children }: Props) {
  const current = exercises[index];
  if (!current) return null;
  const next = exercises[index + 1];
  const isFirst = index === 0;
  const isLast = index === exercises.length - 1;
  const doneCount = exercises.filter(isFocusExerciseComplete).length;
  const setGoal = current.targetSetCount;
  const setProgress =
    setGoal != null && setGoal > 0 ? Math.min(1, current.loggedSetCount / setGoal) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-xl bg-zinc-100 p-3 dark:bg-zinc-900">
        <div className="flex items-baseline justify-between gap-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          <span>
            Exercise {index + 1} of {exercises.length}
          </span>
          <span>
            {doneCount}/{exercises.length} done
          </span>
        </div>

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

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium text-zinc-950 dark:text-zinc-50">
              {current.loggedSetCount}
              {setGoal != null ? ` of ${setGoal}` : ""}{" "}
              {(setGoal ?? current.loggedSetCount) === 1 ? "set" : "sets"} logged
            </span>
            {isFocusExerciseComplete(current) && (
              <span className="flex items-center gap-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
                Done
              </span>
            )}
          </div>
          {setProgress != null && (
            <div
              className="h-1.5 overflow-hidden rounded-full bg-zinc-300 dark:bg-zinc-700"
              aria-hidden="true"
            >
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width] dark:bg-emerald-400"
                style={{ width: `${setProgress * 100}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {children}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onIndexChange(index - 1)}
          disabled={isFirst}
          aria-label="Previous exercise"
          className="flex min-h-12 min-w-12 items-center justify-center rounded-lg border border-zinc-300 disabled:opacity-40 dark:border-zinc-700"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onIndexChange(index + 1)}
          disabled={isLast}
          className="flex min-h-12 flex-1 items-center justify-between gap-2 rounded-lg bg-accent px-4 text-left text-accent-foreground disabled:opacity-40"
        >
          <span className="flex min-w-0 flex-col">
            <span className="text-xs font-medium uppercase tracking-wide opacity-70">
              {next ? "Up next" : "Last exercise"}
            </span>
            <span className="truncate text-base font-semibold">
              {next ? next.name : "Finish when you're ready"}
            </span>
          </span>
          {next && (
            <ChevronRight className="h-6 w-6 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}
