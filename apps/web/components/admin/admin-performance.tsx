import {
  type DashboardRange,
  RATING_LABELS,
  TELEMETRY_RANGES,
  formatVital,
  rateMetric,
} from "@jim/db/admin";
import {
  METRIC_LABELS,
  type MetricStats,
  PERFORMANCE_METRICS,
  type PerformanceMetric,
  type VersionPerformance,
} from "@jim/db/admin";
import {
  AdminCard,
  EmptyState,
  KpiGrid,
  RATING_TONES,
  RangeTabs,
  StatusPill,
} from "./admin-dashboard-ui";

/** The admin Performance page (issue #810): p50 and p75 of each load metric, by app version. */
export function AdminPerformance({
  range,
  all,
  versions,
}: {
  range: DashboardRange;
  all: VersionPerformance;
  versions: VersionPerformance[];
}) {
  const headline: PerformanceMetric[] = ["LCP", "INP", "CLS", "cold_start"];
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Performance</h1>
        <RangeTabs
          path="/admin/performance"
          ranges={TELEMETRY_RANGES}
          current={range}
          fallback="7d"
        />
      </div>
      <KpiGrid>
        {headline.map((metric) => (
          <MetricTile key={metric} metric={metric} stats={all.metrics[metric]} />
        ))}
      </KpiGrid>
      <AdminCard title="By version" aside="p50 / p75">
        {versions.length === 0 ? (
          <EmptyState>No load times in this range</EmptyState>
        ) : (
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
                  <th className="py-2 pr-4 font-normal">Version</th>
                  {PERFORMANCE_METRICS.map((metric) => (
                    <th key={metric} className="py-2 pr-4 text-right font-normal last:pr-0">
                      {METRIC_LABELS[metric]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...versions, { ...all, version: "All" }].map((row) => (
                  <tr
                    key={row.version ?? "none"}
                    className="border-b border-zinc-200 last:border-b-0 dark:border-zinc-800"
                  >
                    <td
                      className={`py-2.5 pr-4 whitespace-nowrap ${row.version === "All" ? "font-medium" : "font-mono text-[13px]"}`}
                    >
                      {row.version ?? "—"}
                    </td>
                    {PERFORMANCE_METRICS.map((metric) => (
                      <td
                        key={metric}
                        className="py-2.5 pr-4 text-right whitespace-nowrap tabular-nums last:pr-0"
                      >
                        <Cell metric={metric} stats={row.metrics[metric]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </>
  );
}

function Cell({ metric, stats }: { metric: PerformanceMetric; stats: MetricStats | undefined }) {
  if (!stats) return <span className="text-zinc-400">—</span>;
  return (
    <span title={`${stats.samples} samples`}>
      <span className="text-zinc-500">{formatVital(metric, stats.p50)}</span>
      {" / "}
      {formatVital(metric, stats.p75)}
    </span>
  );
}

function MetricTile({
  metric,
  stats,
}: { metric: PerformanceMetric; stats: MetricStats | undefined }) {
  const rating = stats ? rateMetric(metric, stats.p75) : null;
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="truncate text-sm text-zinc-500">{METRIC_LABELS[metric]} p75</p>
      <p className="text-2xl font-semibold tabular-nums md:text-3xl">
        {stats ? formatVital(metric, stats.p75) : "—"}
      </p>
      <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
        {rating && <StatusPill tone={RATING_TONES[rating]}>{RATING_LABELS[rating]}</StatusPill>}
        {stats && <span className="tabular-nums">{stats.samples} samples</span>}
      </div>
    </div>
  );
}
