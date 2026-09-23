export interface CalendarMonthDay {
  date: Date;
  inMonth: boolean;
}

export type CalendarMonthWeek = CalendarMonthDay[];

/**
 * Full weeks (aligned to `weekStart`) covering the given month, so the UI can
 * render a fixed 7-column grid without special-casing a partial first or
 * last week — `inMonth` tells the renderer which cells belong to an
 * adjacent month.
 */
export function buildCalendarMonth(monthStart: Date, weekStart: number): CalendarMonthWeek[] {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);

  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - ((firstOfMonth.getDay() - weekStart + 7) % 7));

  const gridEnd = new Date(lastOfMonth);
  gridEnd.setDate(lastOfMonth.getDate() + (6 - ((lastOfMonth.getDay() - weekStart + 7) % 7)));

  const weeks: CalendarMonthWeek[] = [];
  const cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    const week: CalendarMonthDay[] = [];
    for (let i = 0; i < 7; i++) {
      week.push({ date: new Date(cursor), inMonth: cursor.getMonth() === month });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}
