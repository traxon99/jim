import { type TrainingDay, dateKey } from "@jim/core";

const WEEKS = 12;

function intensityClass(volume: number, maxVolume: number): string {
  if (volume <= 0) return "bg-zinc-100 dark:bg-zinc-800";
  const ratio = maxVolume > 0 ? volume / maxVolume : 0;
  if (ratio > 0.75) return "bg-emerald-600 dark:bg-emerald-500";
  if (ratio > 0.5) return "bg-emerald-500/80 dark:bg-emerald-500/70";
  if (ratio > 0.25) return "bg-emerald-400/60 dark:bg-emerald-500/60";
  return "bg-emerald-300/60 dark:bg-emerald-500/35";
}

interface Props {
  days: Map<string, TrainingDay>;
  weekStart: number;
  today?: Date;
}

/**
 * "Calendar heatmap of training frequency" (STORIES.md S7) — a GitHub-style
 * grid, columns = weeks (oldest left, current week rightmost), rows = the
 * 7 weekdays starting from the user's configured `week_start`. Shaded by
 * that day's total volume relative to the busiest day in the window, so
 * "frequency" reads as "how much," not just a yes/no dot.
 */
export function TrainingCalendarHeatmap({ days, weekStart, today = new Date() }: Props) {
  const gridStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const daysSinceWeekStart = (gridStart.getDay() - weekStart + 7) % 7;
  gridStart.setDate(gridStart.getDate() - daysSinceWeekStart - (WEEKS - 1) * 7);

  const cells: { date: Date; day: TrainingDay | undefined }[] = [];
  for (let i = 0; i < WEEKS * 7; i++) {
    const date = new Date(gridStart);
    date.setDate(date.getDate() + i);
    cells.push({ date, day: days.get(dateKey(date)) });
  }

  const maxVolume = Math.max(0, ...[...days.values()].map((day) => day.totalVolume));

  const columns: (typeof cells)[] = [];
  for (let week = 0; week < WEEKS; week++) {
    columns.push(cells.slice(week * 7, week * 7 + 7));
  }

  return (
    <div className="flex gap-1 overflow-x-auto">
      {columns.map((column) => (
        <div key={column[0]?.date.toISOString()} className="flex flex-col gap-1">
          {column.map(({ date, day }) => (
            <div
              key={date.toISOString()}
              title={`${date.toLocaleDateString()}${
                day ? ` — ${day.sessionCount} session${day.sessionCount > 1 ? "s" : ""}` : ""
              }`}
              className={`h-3 w-3 rounded-sm ${intensityClass(day?.totalVolume ?? 0, maxVolume)}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
