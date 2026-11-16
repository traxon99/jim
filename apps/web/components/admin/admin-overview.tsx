import {
  type DashboardRange,
  OVERVIEW_RANGES,
  RATING_LABELS,
  formatDuration,
  formatVital,
  percentChange,
  rateMetric,
} from "@/lib/admin/dashboard";
import type { OverviewData, OverviewKpi } from "@/lib/admin/overview-data";
import Link from "next/link";
import {
  AdminCard,
  KpiGrid,
  KpiTile,
  RATING_TONES,
  RangeTabs,
  StatusPill,
  percentChangeBadge,
} from "./admin-dashboard-ui";
import { AdminTrendChart } from "./admin-trend-chart";

export interface RightNow {
  failures24h: { events: number; newGroups: number };
  lcpP75: number | null;
  syncLagP50: number | null;
  openFeedback: number | null;
}

const NUMBER = new Intl.NumberFormat("en-US");

function kpiChange(kpi: OverviewKpi) {
  return percentChangeBadge(percentChange(kpi.current, kpi.previous));
}

/** The admin Overview (issue #810): who opens and trains, versions, and what needs a look. */
export function AdminOverview({
  range,
  data,
  rightNow,
}: {
  range: DashboardRange;
  data: OverviewData;
  rightNow: RightNow;
}) {
  const lcpRating = rightNow.lcpP75 === null ? null : rateMetric("LCP", rightNow.lcpP75);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Overview</h1>
        <RangeTabs path="/admin/overview" ranges={OVERVIEW_RANGES} current={range} fallback="30d" />
      </div>
      <KpiGrid>
        <KpiTile
          label="Active · opened"
          value={NUMBER.format(data.opened.current)}
          change={kpiChange(data.opened)}
        />
        <KpiTile
          label="Active · trained"
          value={NUMBER.format(data.trained.current)}
          change={kpiChange(data.trained)}
        />
        <KpiTile
          label="Signups"
          value={NUMBER.format(data.signups.current)}
          change={kpiChange(data.signups)}
        />
        <KpiTile
          label="Workouts finished"
          value={NUMBER.format(data.workouts.current)}
          change={kpiChange(data.workouts)}
        />
      </KpiGrid>
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <AdminCard title="Daily active users">
            <AdminTrendChart
              label="Daily active users, opened and trained"
              days={data.days}
              series={[
                { id: "opened", label: "Opened", values: data.dailyOpened, tone: "primary" },
                { id: "trained", label: "Trained", values: data.dailyTrained, tone: "secondary" },
              ]}
            />
          </AdminCard>
          <AdminCard title="Workouts per day">
            <AdminTrendChart
              label="Workouts finished per day"
              kind="bar"
              height={160}
              days={data.days}
              series={[
                { id: "workouts", label: "Workouts", values: data.dailyWorkouts, tone: "primary" },
              ]}
            />
          </AdminCard>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <AdminCard title="Active users">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-zinc-500">
                  <th className="pb-2 text-left font-normal">
                    <span className="sr-only">Measure</span>
                  </th>
                  <th className="pb-2 text-right font-normal">DAU</th>
                  <th className="pb-2 text-right font-normal">WAU</th>
                  <th className="pb-2 text-right font-normal">MAU</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["Opened", data.actives.opened],
                    ["Trained", data.actives.trained],
                  ] as const
                ).map(([label, counts]) => (
                  <tr key={label} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="py-2">{label}</td>
                    <td className="py-2 text-right tabular-nums">{NUMBER.format(counts.day)}</td>
                    <td className="py-2 text-right tabular-nums">{NUMBER.format(counts.week)}</td>
                    <td className="py-2 text-right tabular-nums">{NUMBER.format(counts.month)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminCard>
          <AdminCard title="App versions" aside="Last 7 days">
            {data.versions.length === 0 ? (
              <p className="text-sm text-zinc-500">No opens yet</p>
            ) : (
              <ul className="flex flex-col">
                {data.versions.map((version) => (
                  <li
                    key={version.version}
                    className="flex items-center gap-3 border-b border-zinc-200 py-2.5 last:border-b-0 dark:border-zinc-800"
                  >
                    <span className="w-20 shrink-0 truncate font-mono text-sm">
                      {version.version}
                    </span>
                    <span className="h-2 min-w-0 flex-1 rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <span
                        className="block h-2 rounded-full bg-zinc-900 dark:bg-zinc-100"
                        style={{ width: `${Math.max(2, version.share)}%` }}
                      />
                    </span>
                    <span
                      className="w-24 shrink-0 text-right text-sm tabular-nums"
                      title={`${version.users} accounts`}
                    >
                      {version.share}%<span className="text-zinc-500"> · {version.users}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </AdminCard>
          <AdminCard
            title="Right now"
            aside={
              <Link href="/admin/health" className="underline-offset-2 hover:underline">
                Health
              </Link>
            }
          >
            <ul className="flex flex-col text-sm">
              <RightNowRow label="Failures · 24 h" href="/admin/failures?range=24h">
                <StatusPill
                  tone={
                    rightNow.failures24h.newGroups > 0
                      ? "warn"
                      : rightNow.failures24h.events > 0
                        ? "neutral"
                        : "good"
                  }
                >
                  {rightNow.failures24h.events}
                  {rightNow.failures24h.newGroups > 0 && ` · ${rightNow.failures24h.newGroups} new`}
                </StatusPill>
              </RightNowRow>
              <RightNowRow label="LCP p75 · 7 days" href="/admin/performance">
                {rightNow.lcpP75 === null || !lcpRating ? (
                  <StatusPill tone="neutral">No data</StatusPill>
                ) : (
                  <StatusPill tone={RATING_TONES[lcpRating]}>
                    {formatVital("LCP", rightNow.lcpP75)} · {RATING_LABELS[lcpRating]}
                  </StatusPill>
                )}
              </RightNowRow>
              <RightNowRow label="Sync lag p50 · 24 h" href="/admin/health">
                <StatusPill tone="neutral">
                  {rightNow.syncLagP50 === null ? "No data" : formatDuration(rightNow.syncLagP50)}
                </StatusPill>
              </RightNowRow>
              <RightNowRow label="Feedback" href="/admin/feedback">
                <StatusPill tone="neutral">
                  {rightNow.openFeedback === null
                    ? "Not readable"
                    : `${rightNow.openFeedback === 100 ? "100+" : rightNow.openFeedback} open`}
                </StatusPill>
              </RightNowRow>
            </ul>
          </AdminCard>
        </div>
      </div>
    </>
  );
}

function RightNowRow({
  label,
  href,
  children,
}: {
  label: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <li className="border-b border-zinc-200 last:border-b-0 dark:border-zinc-800">
      <Link href={href} className="flex min-h-11 items-center justify-between gap-3 py-1.5">
        <span>{label}</span>
        {children}
      </Link>
    </li>
  );
}
