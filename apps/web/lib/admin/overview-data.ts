import { serviceDb } from "@/lib/db/user-scoped";
import type { DbOrTx } from "@jim/db";
import { sql } from "drizzle-orm";
import {
  type DashboardRange,
  type VersionShare,
  dayKeys,
  fillDays,
  versionSpread,
} from "./dashboard";

export interface OverviewKpi {
  current: number;
  previous: number;
}

export interface OverviewData {
  /** Accounts that opened the app in the range (app_opens). */
  opened: OverviewKpi;
  /** Accounts that logged at least one set in the range. */
  trained: OverviewKpi;
  signups: OverviewKpi;
  workouts: OverviewKpi;
  days: string[];
  dailyOpened: number[];
  dailyTrained: number[];
  dailyWorkouts: number[];
  /** Distinct accounts over the last day, 7 days and 30 days, whatever the range. */
  actives: {
    opened: { day: number; week: number; month: number };
    trained: { day: number; week: number; month: number };
  };
  /** The version each account opened last, over the last 7 days. */
  versions: VersionShare[];
}

type DayRow = { day: string; count: number };

function rowsOf<T>(result: Iterable<T>): T[] {
  return [...result];
}

function asDayRows(rows: { day: string | Date; count: number | string }[]): DayRow[] {
  return rows.map((row) => ({
    day: typeof row.day === "string" ? row.day.slice(0, 10) : row.day.toISOString().slice(0, 10),
    count: Number(row.count),
  }));
}

/**
 * The Overview page (issue #810). Days are UTC. Only called after
 * requireAdmin(): this reads every account on the server's connection.
 */
export async function loadOverview(
  range: DashboardRange,
  db: DbOrTx = serviceDb(),
  now = new Date(),
): Promise<OverviewData> {
  const dayCount = Math.round(range.hours / 24);
  const days = dayKeys(now, dayCount);
  const first = days[0] as string;
  // Each KPI compares this range with the one just before it.
  const nowIso = now.toISOString();
  const span = sql`(${range.hours} * interval '1 hour')`;
  const start = sql`(${nowIso}::timestamptz - ${span})`;
  const prevStart = sql`(${nowIso}::timestamptz - 2 * ${span})`;

  const [kpis] = rowsOf(
    await db.execute<Record<string, number | string>>(sql`
      SELECT
        (SELECT count(DISTINCT user_id) FROM app_opens
          WHERE day > (${start})::date) AS opened,
        (SELECT count(DISTINCT user_id) FROM app_opens
          WHERE day > (${prevStart})::date AND day <= (${start})::date) AS opened_prev,
        (SELECT count(DISTINCT user_id) FROM sets
          WHERE deleted_at IS NULL AND completed_at > ${start}) AS trained,
        (SELECT count(DISTINCT user_id) FROM sets
          WHERE deleted_at IS NULL AND completed_at > ${prevStart} AND completed_at <= ${start}) AS trained_prev,
        (SELECT count(*) FROM users WHERE created_at > ${start}) AS signups,
        (SELECT count(*) FROM users
          WHERE created_at > ${prevStart} AND created_at <= ${start}) AS signups_prev,
        (SELECT count(*) FROM sessions
          WHERE deleted_at IS NULL AND ended_at > ${start}) AS workouts,
        (SELECT count(*) FROM sessions
          WHERE deleted_at IS NULL AND ended_at > ${prevStart} AND ended_at <= ${start}) AS workouts_prev
    `),
  );
  const [active] = rowsOf(
    await db.execute<Record<string, number | string>>(sql`
      SELECT
        (SELECT count(DISTINCT user_id) FROM app_opens
          WHERE day >= (${nowIso}::timestamptz AT TIME ZONE 'utc')::date) AS opened_day,
        (SELECT count(DISTINCT user_id) FROM app_opens
          WHERE day > (${nowIso}::timestamptz - interval '7 days')::date) AS opened_week,
        (SELECT count(DISTINCT user_id) FROM app_opens
          WHERE day > (${nowIso}::timestamptz - interval '30 days')::date) AS opened_month,
        (SELECT count(DISTINCT user_id) FROM sets WHERE deleted_at IS NULL
          AND completed_at > ${nowIso}::timestamptz - interval '1 day') AS trained_day,
        (SELECT count(DISTINCT user_id) FROM sets WHERE deleted_at IS NULL
          AND completed_at > ${nowIso}::timestamptz - interval '7 days') AS trained_week,
        (SELECT count(DISTINCT user_id) FROM sets WHERE deleted_at IS NULL
          AND completed_at > ${nowIso}::timestamptz - interval '30 days') AS trained_month
    `),
  );
  const actives = (prefix: "opened" | "trained") => ({
    day: Number(active?.[`${prefix}_day`] ?? 0),
    week: Number(active?.[`${prefix}_week`] ?? 0),
    month: Number(active?.[`${prefix}_month`] ?? 0),
  });
  const kpi = (name: string): OverviewKpi => ({
    current: Number(kpis?.[name] ?? 0),
    previous: Number(kpis?.[`${name}_prev`] ?? 0),
  });

  const opened = asDayRows(
    rowsOf(
      await db.execute<{ day: string; count: number }>(sql`
        SELECT day::text AS day, count(DISTINCT user_id)::int AS count
        FROM app_opens WHERE day >= ${first}::date
        GROUP BY day`),
    ),
  );
  const trained = asDayRows(
    rowsOf(
      await db.execute<{ day: string; count: number }>(sql`
        SELECT (completed_at AT TIME ZONE 'utc')::date::text AS day,
               count(DISTINCT user_id)::int AS count
        FROM sets
        WHERE deleted_at IS NULL AND completed_at >= ${first}::date
        GROUP BY 1`),
    ),
  );
  const workouts = asDayRows(
    rowsOf(
      await db.execute<{ day: string; count: number }>(sql`
        SELECT (ended_at AT TIME ZONE 'utc')::date::text AS day, count(*)::int AS count
        FROM sessions
        WHERE deleted_at IS NULL AND ended_at >= ${first}::date
        GROUP BY 1`),
    ),
  );
  const versions = rowsOf(
    await db.execute<{ version: string | null; users: number }>(sql`
      SELECT version, count(*)::int AS users FROM (
        SELECT DISTINCT ON (user_id) user_id, app_version AS version
        FROM app_opens
        WHERE day > (${nowIso}::timestamptz - interval '7 days')::date
        ORDER BY user_id, day DESC
      ) latest
      GROUP BY version`),
  ).map((row) => ({ version: row.version, users: Number(row.users) }));

  return {
    opened: kpi("opened"),
    trained: kpi("trained"),
    signups: kpi("signups"),
    workouts: kpi("workouts"),
    days,
    dailyOpened: fillDays(days, opened),
    dailyTrained: fillDays(days, trained),
    dailyWorkouts: fillDays(days, workouts),
    actives: { opened: actives("opened"), trained: actives("trained") },
    versions: versionSpread(versions),
  };
}
