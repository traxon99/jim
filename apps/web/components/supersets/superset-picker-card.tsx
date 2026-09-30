"use client";

import { FloatingCard } from "@/components/floating-card";
import { useState } from "react";

interface Props {
  /** Every exercise that can join, in display order. */
  exercises: readonly { id: string; name: string }[];
  /** Picked when the card opens: the exercise it was opened from, or its superset's members. */
  initialSelectedIds: readonly string[];
  /** Editing an existing superset rather than creating one. */
  editing?: boolean;
  onSave: (selectedIds: string[]) => void;
  onClose: () => void;
}

/**
 * The Create Superset card (issue #360): tap any two or more exercises and
 * Save makes them one superset, moved together in the list.
 */
export function SupersetPickerCard({
  exercises,
  initialSelectedIds,
  editing = false,
  onSave,
  onClose,
}: Props) {
  const [selected, setSelected] = useState(() => new Set(initialSelectedIds));
  const canSave = selected.size >= 2;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <FloatingCard labelledBy="superset-picker-title" onClose={onClose}>
      {(requestClose) => (
        <>
          <div className="grid touch-none grid-cols-[1fr_auto_1fr] items-center border-b border-zinc-200 px-2 dark:border-zinc-800">
            <button
              type="button"
              onClick={requestClose}
              className="min-h-12 justify-self-start px-2 text-base text-accent"
            >
              Cancel
            </button>
            <h2 id="superset-picker-title" className="text-base font-semibold">
              {editing ? "Edit Superset" : "Create Superset"}
            </h2>
            <button
              type="button"
              disabled={!canSave}
              onClick={() => {
                onSave(exercises.filter((e) => selected.has(e.id)).map((e) => e.id));
                requestClose();
              }}
              className="min-h-12 justify-self-end px-2 text-base font-semibold text-accent disabled:opacity-40"
            >
              Save
            </button>
          </div>

          <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
            {exercises.map((exercise) => {
              const isSelected = selected.has(exercise.id);
              return (
                <li key={exercise.id}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => toggle(exercise.id)}
                    className={`flex min-h-14 w-full items-center gap-3 px-4 text-left text-base font-semibold ${
                      isSelected ? "bg-accent/15" : ""
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-8 w-1 shrink-0 rounded-full ${isSelected ? "bg-accent" : ""}`}
                    />
                    <span className="min-w-0 truncate">{exercise.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="touch-none border-t border-zinc-200 px-4 py-3 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-500">
            Select two or more exercises to {editing ? "keep the" : "create a"} superset
          </p>
        </>
      )}
    </FloatingCard>
  );
}
