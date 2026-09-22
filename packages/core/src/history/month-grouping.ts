/**
 * Companion to week-grouping.ts (S7's "history in month and week format",
 * issue #57) for callers that want a coarser bucket than a week — the
 * session list toggles between the two, so both share the same shape.
 */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export interface MonthGroup<T> {
  monthStart: Date;
  items: T[];
}

/** Groups arbitrary dated items by calendar month, newest month first. */
export function groupByMonth<T>(items: readonly T[], getDate: (item: T) => Date): MonthGroup<T>[] {
  const groups = new Map<number, T[]>();

  for (const item of items) {
    const key = startOfMonth(getDate(item)).getTime();
    const list = groups.get(key);
    if (list) {
      list.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  return [...groups.entries()]
    .sort(([a], [b]) => b - a)
    .map(([time, groupItems]) => ({ monthStart: new Date(time), items: groupItems }));
}
