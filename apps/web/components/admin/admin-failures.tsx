import { type DashboardRange, TELEMETRY_RANGES } from "@/lib/admin/dashboard";
import {
  FAILURE_SOURCES,
  type FailureSourceId,
  type FailuresData,
  failureSourceLabel,
} from "@/lib/admin/failures-data";
import Link from "next/link";
import {
  AdminCard,
  Chip,
  EmptyState,
  KpiGrid,
  KpiTile,
  LinkTabs,
  RangeTabs,
  dashboardHref,
} from "./admin-dashboard-ui";
import { RelativeTime } from "./relative-time";
import { SparkBars } from "./spark-bars";

const NUMBER = new Intl.NumberFormat("en-US");

/** The admin Failures list (issue #810): every failure grouped by fingerprint. */
export function AdminFailures({
  range,
  source,
  data,
}: {
  range: DashboardRange;
  source: FailureSourceId | null;
  data: FailuresData;
}) {
  const rangeParam = range.id === "7d" ? null : range.id;
  // Like a crash-free rate: the share of active accounts that hit nothing.
  const failureFree =
    data.openedUsers > 0
      ? Math.max(0, Math.round(((data.openedUsers - data.users) / data.openedUsers) * 1000) / 10)
      : null;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Failures</h1>
        <div className="flex max-w-full flex-wrap gap-2">
          <LinkTabs
            label="Source"
            items={[{ id: "all", label: "All" }, ...FAILURE_SOURCES].map((item) => ({
              id: item.id,
              label: item.label,
              current: (source ?? "all") === item.id,
              href: dashboardHref("/admin/failures", {
                source: item.id === "all" ? null : item.id,
                range: rangeParam,
              }),
            }))}
          />
          <RangeTabs
            path="/admin/failures"
            ranges={TELEMETRY_RANGES}
            current={range}
            fallback="7d"
            params={{ source }}
          />
        </div>
      </div>
      <KpiGrid>
        <KpiTile label="Events" value={NUMBER.format(data.events)} />
        <KpiTile
          label="Groups"
          value={NUMBER.format(data.groups.length)}
          note={data.newGroups > 0 ? `${data.newGroups} new` : undefined}
        />
        <KpiTile
          label="Users affected"
          value={NUMBER.format(data.users)}
          note={`of ${NUMBER.format(data.openedUsers)} active`}
        />
        <KpiTile
          label="Failure-free users"
          value={failureFree === null ? "—" : `${failureFree}%`}
        />
      </KpiGrid>
      <AdminCard>
        {data.groups.length === 0 ? (
          <EmptyState>No failures in this range</EmptyState>
        ) : (
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
                  <th className="py-2 pr-4 font-normal">Error</th>
                  <th className="py-2 pr-4 font-normal">Source</th>
                  <th className="py-2 pr-4 font-normal">Version</th>
                  <th className="py-2 pr-4 font-normal">{range.label}</th>
                  <th className="py-2 pr-4 text-right font-normal">Events</th>
                  <th className="py-2 pr-4 text-right font-normal">Users</th>
                  <th className="py-2 text-right font-normal">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {data.groups.map((group) => (
                  <tr
                    key={group.fingerprint}
                    className="border-b border-zinc-200 last:border-b-0 dark:border-zinc-800"
                  >
                    <td className="max-w-md py-2.5 pr-4">
                      <Link
                        href={dashboardHref(
                          `/admin/failures/${encodeURIComponent(group.fingerprint)}`,
                          {
                            source,
                            range: rangeParam,
                          },
                        )}
                        className="block min-w-0 underline-offset-2 hover:underline"
                      >
                        <span className="block truncate font-mono text-[13px]">
                          {group.name}
                          {group.message ? `: ${group.message}` : ""}
                        </span>
                      </Link>
                      {group.isNew && (
                        <span className="mt-1 inline-flex rounded-md bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
                          New
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      <Chip>{failureSourceLabel(group.kind)}</Chip>
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-[13px] whitespace-nowrap">
                      {group.appVersion ?? "—"}
                    </td>
                    <td className="py-2.5 pr-4">
                      <SparkBars
                        values={group.buckets}
                        label={`${group.events} events across ${range.label}`}
                      />
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{group.events}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{group.users}</td>
                    <td className="py-2.5 text-right whitespace-nowrap text-zinc-500">
                      <RelativeTime iso={group.lastSeenAt} />
                    </td>
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
