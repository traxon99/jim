import { formatBytes, formatDuration } from "@jim/db/admin";
import { type HealthData, SERVICE_STATE_LABELS, type ServiceState } from "@jim/db/admin";
import {
  AdminCard,
  EmptyState,
  KpiGrid,
  KpiTile,
  type PillTone,
  StatusPill,
} from "./admin-dashboard-ui";
import { LocalDateTime } from "./local-date-time";
import { RelativeTime } from "./relative-time";

const NUMBER = new Intl.NumberFormat("en-US");

const STATE_TONES: Record<ServiceState, PillTone> = {
  healthy: "good",
  degraded: "warn",
  down: "bad",
  not_configured: "neutral",
};

/** The admin Health page (issue #810): database, sync, deploy and services. */
export function AdminHealth({ health }: { health: HealthData }) {
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">Health</h1>
        <span className="text-sm text-zinc-500">
          Checked <LocalDateTime iso={health.checkedAt} />
        </span>
      </div>
      <KpiGrid>
        <KpiTile
          label="Database size"
          value={health.databaseBytes === null ? "—" : formatBytes(health.databaseBytes)}
        />
        <KpiTile
          label="Connections"
          value={health.connections ? NUMBER.format(health.connections.used) : "—"}
          note={health.connections ? `of ${health.connections.max}` : undefined}
        />
        <KpiTile
          label="Sync lag p50 · 24 h"
          value={health.syncLag ? formatDuration(health.syncLag.p50) : "—"}
          note={health.syncLag ? `p95 ${formatDuration(health.syncLag.p95)}` : undefined}
        />
        <KpiTile
          label="Deployed"
          value={<span className="font-mono text-xl md:text-2xl">{health.deploy.version}</span>}
          note={
            health.deploy.builtAt ? (
              <>
                <RelativeTime iso={health.deploy.builtAt} />
                {health.deploy.commit ? ` · ${health.deploy.commit}` : ""}
              </>
            ) : (
              (health.deploy.commit ?? undefined)
            )
          }
        />
      </KpiGrid>
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <AdminCard title="Slowest queries" aside="pg_stat_statements">
          {health.slowQueries === null ? (
            <EmptyState>pg_stat_statements isn't installed</EmptyState>
          ) : health.slowQueries.length === 0 ? (
            <EmptyState>No queries recorded yet</EmptyState>
          ) : (
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
                    <th className="py-2 pr-4 font-normal">Query</th>
                    <th className="py-2 pr-4 text-right font-normal">Calls</th>
                    <th className="py-2 pr-4 text-right font-normal">Mean</th>
                    <th className="py-2 text-right font-normal">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {health.slowQueries.map((query, index) => (
                    <tr
                      // biome-ignore lint/suspicious/noArrayIndexKey: two statements can share a cut-off text
                      key={index}
                      className="border-b border-zinc-200 last:border-b-0 dark:border-zinc-800"
                    >
                      <td className="max-w-xs py-2.5 pr-4">
                        <span
                          className="allow-pwa-select block truncate font-mono text-xs"
                          title={query.query}
                        >
                          {query.query}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">
                        {NUMBER.format(query.calls)}
                      </td>
                      <td className="py-2.5 pr-4 text-right whitespace-nowrap tabular-nums">
                        {formatDuration(query.meanMs)}
                      </td>
                      <td className="py-2.5 text-right whitespace-nowrap tabular-nums">
                        {formatDuration(query.totalMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>
        <AdminCard title="Services">
          <ul className="flex flex-col">
            {health.services.map((service) => (
              <li
                key={service.name}
                className="flex min-h-14 items-center justify-between gap-3 border-b border-zinc-200 py-2 last:border-b-0 dark:border-zinc-800"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{service.name}</p>
                  <p className="truncate text-xs text-zinc-500">{service.detail}</p>
                </div>
                <StatusPill tone={STATE_TONES[service.state]}>
                  {SERVICE_STATE_LABELS[service.state]}
                </StatusPill>
              </li>
            ))}
          </ul>
        </AdminCard>
      </div>
    </>
  );
}
