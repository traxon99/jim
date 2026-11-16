/**
 * Pure helpers shared by the admin dashboards (issue #810): the time ranges
 * each page offers, day series, deltas and the number formats the pages show.
 */

export interface DashboardRange {
  id: string;
  label: string;
  /** The window in hours (24 for "24 h", 168 for "7 days"). */
  hours: number;
}

export const OVERVIEW_RANGES: readonly DashboardRange[] = [
  { id: "7d", label: "7 days", hours: 7 * 24 },
  { id: "30d", label: "30 days", hours: 30 * 24 },
  { id: "90d", label: "90 days", hours: 90 * 24 },
];

/** Telemetry is kept 30 days (#809), so no longer window is offered. */
export const TELEMETRY_RANGES: readonly DashboardRange[] = [
  { id: "24h", label: "24 h", hours: 24 },
  { id: "7d", label: "7 days", hours: 7 * 24 },
  { id: "30d", label: "30 days", hours: 30 * 24 },
];

/** The range a `?range=` value names, or `fallback` for anything else. */
export function pickRange(
  ranges: readonly DashboardRange[],
  value: string | string[] | undefined,
  fallback: string,
): DashboardRange {
  const id = Array.isArray(value) ? value[0] : value;
  const match = ranges.find((range) => range.id === id) ?? ranges.find((r) => r.id === fallback);
  if (!match) throw new Error(`No range ${fallback}`);
  return match;
}

/** A UTC day key (YYYY-MM-DD). */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The `count` UTC day keys ending with `end`'s day, oldest first. */
export function dayKeys(end: Date, count: number): string[] {
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Array.from({ length: count }, (_, i) =>
    dayKey(new Date(last - (count - 1 - i) * 86_400_000)),
  );
}

/** `rows` laid out on `days`, with 0 for a day that has no row. */
export function fillDays(days: string[], rows: { day: string; count: number }[]): number[] {
  const byDay = new Map(rows.map((row) => [row.day, row.count]));
  return days.map((day) => byDay.get(day) ?? 0);
}

/** Change from `previous` as a whole percent, or null when there's nothing to compare. */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export interface VersionShare {
  version: string;
  users: number;
  share: number;
}

/**
 * The app versions people run, most used first: the top `keep` by name, the
 * rest folded into "Other". Shares are whole percents of everyone counted.
 */
export function versionSpread(
  rows: { version: string | null; users: number }[],
  keep = 3,
): VersionShare[] {
  const total = rows.reduce((sum, row) => sum + row.users, 0);
  if (total === 0) return [];
  const sorted = [...rows].sort((a, b) => b.users - a.users);
  const top = sorted.filter((row) => row.version).slice(0, keep);
  const rest = total - top.reduce((sum, row) => sum + row.users, 0);
  const spread = top.map((row) => ({ version: row.version as string, users: row.users }));
  if (rest > 0) spread.push({ version: "Other", users: rest });
  return spread.map((row) => ({ ...row, share: Math.round((row.users / total) * 100) }));
}

/** A duration for a dashboard tile: "840 ms", "2.4 s", "3 min", "5 h". */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)} h`;
  return `${Math.round(ms / 86_400_000)} d`;
}

/** A vital's value in its own unit: CLS is unitless, the rest are milliseconds. */
export function formatVital(name: string, value: number): string {
  return name === "CLS" ? value.toFixed(2) : formatDuration(value);
}

/** Bytes as "412 MB" or "1.2 GB". */
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export type Rating = "good" | "fair" | "poor";

/** Google's Web Vitals thresholds for a p75, and the cold start's own. */
const THRESHOLDS: Record<string, [number, number]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
  cold_start: [2000, 4000],
};

/** How a metric's p75 rates, or null for a metric without thresholds. */
export function rateMetric(name: string, p75: number): Rating | null {
  const limits = THRESHOLDS[name];
  if (!limits) return null;
  if (p75 <= limits[0]) return "good";
  return p75 <= limits[1] ? "fair" : "poor";
}

export const RATING_LABELS: Record<Rating, string> = {
  good: "Good",
  fair: "Needs work",
  poor: "Poor",
};
