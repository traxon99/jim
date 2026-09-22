"use client";

import type { ProgramRoutineRow as ProgramRoutineEntity } from "@/lib/db/schema";
import { WEEKDAY_NAMES } from "@/lib/programs/weekdays";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Props {
  item: ProgramRoutineEntity;
  routineName: string;
  step: number;
  weekly: boolean;
  weekdayOrder: number[];
  isNext: boolean;
  onWeekdayChange: (weekday: number | null) => void;
  onRemove: () => void;
}

export function ProgramRoutineRow({
  item,
  routineName,
  step,
  weekly,
  weekdayOrder,
  isNext,
  onWeekdayChange,
  onRemove,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center justify-between gap-2 rounded-lg border bg-white p-2 dark:bg-zinc-900 ${
        isNext ? "border-zinc-950 dark:border-zinc-50" : "border-zinc-200 dark:border-zinc-800"
      } ${isDragging ? "opacity-50" : ""}`}
    >
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
        {!weekly && (
          <span className="w-5 shrink-0 text-sm tabular-nums text-zinc-500 dark:text-zinc-500">
            {step}.
          </span>
        )}
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-base font-medium">{routineName}</span>
          {isNext && (
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-500">Up next</span>
          )}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {weekly && (
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
          className="min-h-11 px-1 text-sm font-medium text-red-600 dark:text-red-500"
        >
          Remove
        </button>
      </div>
    </li>
  );
}
