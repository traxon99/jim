/**
 * Users configure `week_start` (0 = Sunday .. 6 = Saturday,
 * docs/ARCHITECTURE.md §4) rather than the app assuming Monday- or
 * Sunday-first weeks. Every weekly grouping in history (the session list,
 * volume-by-muscle) needs to agree on the same week boundary, so it lives
 * here once rather than being reimplemented per view.
 */
export function startOfWeek(date: Date, weekStart: number): Date {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceWeekStart = (local.getDay() - weekStart + 7) % 7;
  local.setDate(local.getDate() - daysSinceWeekStart);
  return local;
}

export interface WeekGroup<T> {
  weekStart: Date;
  items: T[];
}

/** Groups arbitrary dated items by the week (per `startOfWeek`) they fall in, newest week first. */
export function groupByWeek<T>(
  items: readonly T[],
  weekStart: number,
  getDate: (item: T) => Date,
): WeekGroup<T>[] {
  const groups = new Map<number, T[]>();

  for (const item of items) {
    const key = startOfWeek(getDate(item), weekStart).getTime();
    const list = groups.get(key);
    if (list) {
      list.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  return [...groups.entries()]
    .sort(([a], [b]) => b - a)
    .map(([time, groupItems]) => ({ weekStart: new Date(time), items: groupItems }));
}
