"use client";

import { RoutineIcon } from "@/components/routines/routine-icon";
import type { ProgramRoutineRow as ProgramRoutineEntity, RoutineRow } from "@/lib/db/schema";
import { WEEKDAY_NAMES } from "@/lib/programs/weekdays";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { WARMUP_TEMPLATES } from "@jim/core";
import { Moon, Trash2 } from "lucide-react";

interface Props {
  item: ProgramRoutineEntity;
  /** Null for a rest day (issue #366). */
  routine: RoutineRow | null;
  /** A warm-up routine added as a step before pairing existed — skipped by suggestions. */
  isWarmup: boolean;
  /** Name of the warm-up paired with this routine, if it still exists. */
  warmupName: string | undefined;
  warmupRoutines: RoutineRow[];
  step: number;
  weekly: boolean;
  weekdayOrder: number[];
  isNext: boolean;
  onWeekdayChange: (weekday: number | null) => void;
  /** "" = none, "routine:<id>" or "template:<key>" — see pairWarmup. */
  onWarmupChange: (choice: string) => void;
  onRemove: () => void;
}

export function ProgramRoutineRow({
  item,
  routine,
  isWarmup,
  warmupName,
  warmupRoutines,
  step,
  weekly,
  weekdayOrder,
  isNext,
  onWeekdayChange,
  onWarmupChange,
  onRemove,
}: Props) {
  const routineName = routine?.name ?? "Rest day";
  const pairedId = warmupName ? routine?.warmupRoutineId : null;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex flex-col gap-2 rounded-lg border bg-white p-2 dark:bg-zinc-900 ${
        isNext ? "border-accent" : "border-zinc-200 dark:border-zinc-800"
      } ${isDragging ? "opacity-50" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
            className="flex h-11 w-8 shrink-0 touch-none items-center justify-center text-zinc-400 dark:text-zinc-600"
          >
            ⠿
          </button>
          {!weekly && !isWarmup && (
            <span className="w-5 shrink-0 text-sm tabular-nums text-zinc-500 dark:text-zinc-500">
              {step}.
            </span>
          )}
          <span className="flex min-w-0 flex-col">
            <span className="flex min-w-0 items-center gap-2">
              {routine ? (
                <RoutineIcon shape={routine.iconShape} color={routine.iconColor} />
              ) : (
                <Moon
                  className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-500"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              )}
              <span className="truncate text-base font-medium">{routineName}</span>
            </span>
            {isNext && (
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-500">Up next</span>
            )}
            {isWarmup && (
              <span className="text-xs text-zinc-500 dark:text-zinc-500">
                Warm-up · skipped — pair it with a routine instead
              </span>
            )}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {weekly && !isWarmup && (
            <select
              aria-label={`Day for ${routineName}`}
              value={item.weekday ?? ""}
              onChange={(event) =>
                onWeekdayChange(event.target.value === "" ? null : Number(event.target.value))
              }
              className="min-h-11 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="">No day</option>
              {weekdayOrder.map((day) => (
                <option key={day} value={day}>
                  {WEEKDAY_NAMES[day]}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${routineName} from the program`}
            className="flex min-h-11 min-w-11 items-center justify-center text-red-600 dark:text-red-500"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </div>

      {routine && !isWarmup && (
        <label className="flex items-center gap-2 pl-10 text-sm text-zinc-600 dark:text-zinc-400">
          Warm-up
          <select
            aria-label={`Warm-up for ${routineName}`}
            value={pairedId ? `routine:${pairedId}` : ""}
            onChange={(event) => onWarmupChange(event.target.value)}
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="">None</option>
            {warmupRoutines.length > 0 && (
              <optgroup label="My warm-ups">
                {warmupRoutines.map((warmup) => (
                  <option key={warmup.id} value={`routine:${warmup.id}`}>
                    {warmup.name}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Templates">
              {WARMUP_TEMPLATES.map((template) => (
                <option key={template.key} value={`template:${template.key}`}>
                  {template.name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
      )}
    </li>
  );
}
