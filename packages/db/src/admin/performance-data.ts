import { TELEMETRY_VITALS } from "@jim/core";
import { sql } from "drizzle-orm";
import type { DbOrTx } from "../index";
import type { DashboardRange } from "./dashboard";

/** The metrics the Performance page shows, in column order. */
export const PERFORMANCE_METRICS = [...TELEMETRY_VITALS, "cold_start"] as const;
export type PerformanceMetric = (typeof PERFORMANCE_METRICS)[number];

export const METRIC_LABELS: Record<PerformanceMetric, string> = {
  LCP: "LCP",
  INP: "INP",
  CLS: "CLS",
  TTFB: "TTFB",
  FCP: "FCP",
  cold_start: "Cold start",
};

export interface MetricStats {
  p50: number;
  p75: number;
  samples: number;
}

export interface VersionPerformance {
  /** Null for events that carried no version. */
  version: string | null;
  lastSeenAt: string;
  metrics: Partial<Record<PerformanceMetric, MetricStats>>;
}

/** Versions shown, newest first; older ones fold away. */
export const PERFORMANCE_VERSIONS = 6;

/**
 * p50 and p75 of each Web Vital and the cold start, per app version (issue
 * #810), over the range. Only called after requireAdmin().
 */
export async function loadPerformance(
  range: DashboardRange,
  db: DbOrTx,
  now = new Date(),
): Promise<{ all: VersionPerformance; versions: VersionPerformance[] }> {
  const start = sql`(${now.toISOString()}::timestamptz - (${range.hours} * interval '1 hour'))`;
  const rows = [
    ...(await db.execute<{
      version: string | null;
      grouped: boolean;
      metric: string;
      p50: number;
      p75: number;
      samples: number;
      last_seen: Date | string;
    }>(sql`
      SELECT version, grouping(version) = 1 AS grouped, metric,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY value) AS p50,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS p75,
        count(*)::int AS samples,
        max(created_at) AS last_seen
      FROM (
        SELECT app_version AS version, value, created_at,
          CASE WHEN kind = 'cold_start' THEN 'cold_start' ELSE name END AS metric
        FROM telemetry_events
        WHERE kind IN ('vital', 'cold_start') AND value IS NOT NULL AND created_at > ${start}
      ) samples
      GROUP BY GROUPING SETS ((version, metric), (metric))`)),
  ];

  const byVersion = new Map<string, VersionPerformance>();
  const all: VersionPerformance = { version: null, lastSeenAt: "", metrics: {} };
  for (const row of rows) {
    if (!(PERFORMANCE_METRICS as readonly string[]).includes(row.metric)) continue;
    const lastSeenAt = new Date(row.last_seen).toISOString();
    const stats = { p50: Number(row.p50), p75: Number(row.p75), samples: Number(row.samples) };
    const target = row.grouped
      ? all
      : (byVersion.get(row.version ?? "") ??
        (() => {
          const created: VersionPerformance = { version: row.version, lastSeenAt, metrics: {} };
          byVersion.set(row.version ?? "", created);
          return created;
        })());
    target.metrics[row.metric as PerformanceMetric] = stats;
    if (lastSeenAt > target.lastSeenAt) target.lastSeenAt = lastSeenAt;
  }
  const versions = [...byVersion.values()]
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
    .slice(0, PERFORMANCE_VERSIONS);
  return { all, versions };
}
