import { serviceDb } from "@/lib/db/user-scoped";
import type { DbOrTx } from "@jim/db";
import { sql } from "drizzle-orm";
import { type DashboardRange, dayKeys } from "./dashboard";

/** Where a failure came from, as the Failures filter names it. */
export const FAILURE_SOURCES = [
  { id: "client", label: "Client", kind: "error" },
  { id: "sync", label: "Sync", kind: "sync_failure" },
  { id: "server", label: "Server", kind: "server_error" },
  { id: "mcp", label: "MCP", kind: "mcp_error" },
] as const;

export type FailureSourceId = (typeof FAILURE_SOURCES)[number]["id"];

const FAILURE_KINDS = FAILURE_SOURCES.map((source) => source.kind);

/** A group is new when its first event is this recent. */
export const NEW_GROUP_HOURS = 24;

export function pickFailureSource(value: string | string[] | undefined): FailureSourceId | null {
  const id = Array.isArray(value) ? value[0] : value;
  return FAILURE_SOURCES.find((source) => source.id === id)?.id ?? null;
}

export function failureSourceLabel(kind: string): string {
  return FAILURE_SOURCES.find((source) => source.kind === kind)?.label ?? kind;
}

export interface FailureGroup {
  fingerprint: string;
  kind: string;
  name: string;
  message: string | null;
  /** The version most of its events came from, or null for server-side ones. */
  appVersion: string | null;
  events: number;
  users: number;
  firstSeenAt: string;
  lastSeenAt: string;
  isNew: boolean;
  /** Events per bucket across the range: hours for 24 h, days otherwise. */
  buckets: number[];
}

export interface FailuresData {
  events: number;
  users: number;
  /** Accounts that opened the app in the range, so users affected has a base. */
  openedUsers: number;
  newGroups: number;
  groups: FailureGroup[];
}

function kindFilter(source: FailureSourceId | null) {
  const kinds = source
    ? [FAILURE_SOURCES.find((s) => s.id === source)?.kind as string]
    : FAILURE_KINDS;
  return sql`kind IN (${sql.join(
    kinds.map((kind) => sql`${kind}`),
    sql`, `,
  )})`;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * Failures grouped by fingerprint (issue #810), most events first. Only
 * called after requireAdmin(): telemetry has no read policy for users.
 */
export async function loadFailures(
  range: DashboardRange,
  source: FailureSourceId | null,
  db: DbOrTx = serviceDb(),
  now = new Date(),
): Promise<FailuresData> {
  const nowIso = now.toISOString();
  const start = sql`(${nowIso}::timestamptz - (${range.hours} * interval '1 hour'))`;
  const where = sql`${kindFilter(source)} AND fingerprint IS NOT NULL AND created_at > ${start}`;
  const hourly = range.hours <= 24;

  const [totals] = [
    ...(await db.execute<{ events: number; users: number; opened: number }>(sql`
      SELECT count(*)::int AS events, count(DISTINCT user_id)::int AS users,
        (SELECT count(DISTINCT user_id)::int FROM app_opens WHERE day > (${start})::date) AS opened
      FROM telemetry_events WHERE ${where}`)),
  ];

  const groups = [
    ...(await db.execute<{
      fingerprint: string;
      kind: string;
      name: string;
      message: string | null;
      app_version: string | null;
      events: number;
      users: number;
      first_seen: Date | string;
      last_seen: Date | string;
    }>(sql`
      SELECT fingerprint,
        (array_agg(kind ORDER BY created_at DESC))[1] AS kind,
        (array_agg(name ORDER BY created_at DESC))[1] AS name,
        (array_agg(message ORDER BY created_at DESC))[1] AS message,
        mode() WITHIN GROUP (ORDER BY app_version) AS app_version,
        count(*)::int AS events,
        count(DISTINCT user_id)::int AS users,
        (SELECT min(created_at) FROM telemetry_events first
          WHERE first.fingerprint = e.fingerprint) AS first_seen,
        max(created_at) AS last_seen
      FROM telemetry_events e
      WHERE ${where}
      GROUP BY fingerprint
      ORDER BY events DESC, last_seen DESC
      LIMIT 100`)),
  ];

  const bucketKeys = hourly ? hourKeys(now) : dayKeys(now, Math.round(range.hours / 24));
  const bucketRows = groups.length
    ? [
        ...(await db.execute<{ fingerprint: string; bucket: string; count: number }>(sql`
          SELECT fingerprint,
            to_char(date_trunc(${hourly ? "hour" : "day"}, created_at AT TIME ZONE 'utc'),
              ${hourly ? 'YYYY-MM-DD"T"HH24' : "YYYY-MM-DD"}) AS bucket,
            count(*)::int AS count
          FROM telemetry_events
          WHERE ${where} AND fingerprint IN (${sql.join(
            groups.map((group) => sql`${group.fingerprint}`),
            sql`, `,
          )})
          GROUP BY 1, 2`)),
      ]
    : [];
  const byGroup = new Map<string, Map<string, number>>();
  for (const row of bucketRows) {
    const map = byGroup.get(row.fingerprint) ?? new Map<string, number>();
    map.set(row.bucket, Number(row.count));
    byGroup.set(row.fingerprint, map);
  }

  const newCutoff = Date.parse(nowIso) - NEW_GROUP_HOURS * 3_600_000;
  const shaped = groups.map((group) => {
    const firstSeenAt = iso(group.first_seen);
    const counts = byGroup.get(group.fingerprint);
    return {
      fingerprint: group.fingerprint,
      kind: group.kind,
      name: group.name,
      message: group.message,
      appVersion: group.app_version,
      events: Number(group.events),
      users: Number(group.users),
      firstSeenAt,
      lastSeenAt: iso(group.last_seen),
      isNew: Date.parse(firstSeenAt) > newCutoff,
      buckets: bucketKeys.map((key) => counts?.get(key) ?? 0),
    };
  });

  return {
    events: Number(totals?.events ?? 0),
    users: Number(totals?.users ?? 0),
    openedUsers: Number(totals?.opened ?? 0),
    newGroups: shaped.filter((group) => group.isNew).length,
    groups: shaped,
  };
}

/** The 24 UTC hour keys ("YYYY-MM-DDTHH") ending with `now`'s hour. */
function hourKeys(now: Date): string[] {
  const last = Math.floor(now.getTime() / 3_600_000) * 3_600_000;
  return Array.from({ length: 24 }, (_, i) =>
    new Date(last - (23 - i) * 3_600_000).toISOString().slice(0, 13),
  );
}

/** How many failure groups first appeared in the last day, for the nav badge. */
export async function countNewFailureGroups(db: DbOrTx = serviceDb()): Promise<number> {
  const [row] = [
    ...(await db.execute<{ count: number }>(sql`
      SELECT count(*)::int AS count FROM (
        SELECT fingerprint FROM telemetry_events
        WHERE ${kindFilter(null)} AND fingerprint IS NOT NULL
        GROUP BY fingerprint
        HAVING min(created_at) > now() - (${NEW_GROUP_HOURS} * interval '1 hour')
      ) fresh`)),
  ];
  return Number(row?.count ?? 0);
}

export interface FailureOccurrence {
  id: string;
  createdAt: string;
  appVersion: string | null;
  path: string | null;
  message: string | null;
  detail: unknown;
  userId: string | null;
  user: string | null;
}

export interface FailureDetail {
  fingerprint: string;
  kind: string;
  name: string;
  message: string | null;
  events: number;
  firstSeenAt: string;
  lastSeenAt: string;
  users: { id: string; label: string; events: number }[];
  versions: { version: string | null; events: number }[];
  recent: FailureOccurrence[];
}

/** One failure group over the whole retention window, or null when there's none. */
export async function loadFailureDetail(
  fingerprint: string,
  db: DbOrTx = serviceDb(),
): Promise<FailureDetail | null> {
  const recent = [
    ...(await db.execute<{
      id: string;
      kind: string;
      name: string;
      message: string | null;
      created_at: Date | string;
      app_version: string | null;
      path: string | null;
      detail: unknown;
      user_id: string | null;
      user_label: string | null;
    }>(sql`
      SELECT e.id, e.kind, e.name, e.message, e.created_at, e.app_version, e.path, e.detail,
        e.user_id, coalesce(u.username, u.email) AS user_label
      FROM telemetry_events e LEFT JOIN users u ON u.id = e.user_id
      WHERE e.fingerprint = ${fingerprint}
      ORDER BY e.created_at DESC
      LIMIT 20`)),
  ];
  const latest = recent[0];
  if (!latest) return null;

  const [summary] = [
    ...(await db.execute<{ events: number; first_seen: Date | string; last_seen: Date | string }>(
      sql`SELECT count(*)::int AS events, min(created_at) AS first_seen, max(created_at) AS last_seen
        FROM telemetry_events WHERE fingerprint = ${fingerprint}`,
    )),
  ];
  const users = [
    ...(await db.execute<{ id: string; label: string; events: number }>(sql`
      SELECT u.id, coalesce(u.username, u.email) AS label, count(*)::int AS events
      FROM telemetry_events e JOIN users u ON u.id = e.user_id
      WHERE e.fingerprint = ${fingerprint}
      GROUP BY u.id, label
      ORDER BY events DESC
      LIMIT 50`)),
  ];
  const versions = [
    ...(await db.execute<{ version: string | null; events: number }>(sql`
      SELECT app_version AS version, count(*)::int AS events
      FROM telemetry_events WHERE fingerprint = ${fingerprint}
      GROUP BY app_version ORDER BY events DESC`)),
  ];

  return {
    fingerprint,
    kind: latest.kind,
    name: latest.name,
    message: latest.message,
    events: Number(summary?.events ?? recent.length),
    firstSeenAt: iso(summary?.first_seen ?? latest.created_at),
    lastSeenAt: iso(summary?.last_seen ?? latest.created_at),
    users: users.map((row) => ({ id: row.id, label: row.label, events: Number(row.events) })),
    versions: versions.map((row) => ({ version: row.version, events: Number(row.events) })),
    recent: recent.map((row) => ({
      id: row.id,
      createdAt: iso(row.created_at),
      appVersion: row.app_version,
      path: row.path,
      message: row.message,
      detail: row.detail,
      userId: row.user_id,
      user: row.user_label,
    })),
  };
}
