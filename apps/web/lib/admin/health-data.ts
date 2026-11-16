import { serviceDb } from "@/lib/db/user-scoped";
import { APP_VERSION } from "@/lib/version";
import type { DbOrTx } from "@jim/db";
import { sql } from "drizzle-orm";
import { checkFeedbackToken } from "./feedback-data";

export type ServiceState = "healthy" | "degraded" | "down" | "not_configured";

export const SERVICE_STATE_LABELS: Record<ServiceState, string> = {
  healthy: "Healthy",
  degraded: "Slow",
  down: "Down",
  not_configured: "Not set up",
};

export interface ServiceStatus {
  name: string;
  detail: string;
  state: ServiceState;
}

export interface SlowQuery {
  query: string;
  calls: number;
  meanMs: number;
  totalMs: number;
}

export interface HealthData {
  checkedAt: string;
  databaseBytes: number | null;
  connections: { used: number; max: number } | null;
  /** Phone-to-server time of each change synced in the last 24 h. */
  syncLag: { p50: number; p95: number; samples: number } | null;
  deploy: { version: string; commit: string | null; region: string | null; builtAt: string | null };
  /** Null when pg_stat_statements isn't installed or readable. */
  slowQueries: SlowQuery[] | null;
  services: ServiceStatus[];
}

/** A response slower than this marks a service as slow. */
const SLOW_MS = 1500;
const PROBE_TIMEOUT_MS = 5000;

async function attempt<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    console.error("[admin] health check failed:", error);
    return null;
  }
}

/** The MCP server's own liveness probe, timed. */
async function probeMcp(fetchImpl: typeof fetch): Promise<ServiceStatus> {
  const origin = process.env.NEXT_PUBLIC_MCP_URL;
  if (!origin) return { name: "jim-mcp", detail: "Fly", state: "not_configured" };
  const started = Date.now();
  try {
    const response = await fetchImpl(new URL("/healthz", origin), {
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const ms = Date.now() - started;
    if (!response.ok)
      return { name: "jim-mcp", detail: `Fly · HTTP ${response.status}`, state: "down" };
    return {
      name: "jim-mcp",
      detail: `Fly · ${ms} ms`,
      state: ms > SLOW_MS ? "degraded" : "healthy",
    };
  } catch {
    return { name: "jim-mcp", detail: "Fly · no answer", state: "down" };
  }
}

/**
 * The Health page (issue #810). Each check stands alone, so one that fails
 * (a missing extension, a slow GitHub) leaves the rest of the page. Only
 * called after requireAdmin().
 */
export async function loadHealth(
  db: DbOrTx = serviceDb(),
  fetchImpl: typeof fetch = fetch,
): Promise<HealthData> {
  const dbStarted = Date.now();
  const databaseBytes = await attempt(async () => {
    const [row] = [
      ...(await db.execute<{ bytes: number | string }>(
        sql`SELECT pg_database_size(current_database()) AS bytes`,
      )),
    ];
    return Number(row?.bytes ?? 0);
  });
  const dbMs = Date.now() - dbStarted;

  const connections = await attempt(async () => {
    const [row] = [
      ...(await db.execute<{ used: number; max: number | string }>(sql`
        SELECT (SELECT count(*)::int FROM pg_stat_activity) AS used,
               current_setting('max_connections') AS max`)),
    ];
    return { used: Number(row?.used ?? 0), max: Number(row?.max ?? 0) };
  });

  // A change's id is a UUIDv7 minted on the phone, so its first 48 bits are
  // when it was made; applied_at is when the server took it.
  const syncLag = await attempt(async () => {
    const [row] = [
      ...(await db.execute<{ p50: number | null; p95: number | null; samples: number }>(sql`
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY lag) AS p50,
               percentile_cont(0.95) WITHIN GROUP (ORDER BY lag) AS p95,
               count(*)::int AS samples
        FROM (
          SELECT greatest(0, extract(epoch FROM applied_at) * 1000
            - ('x' || translate(left(id::text, 13), '-', ''))::bit(48)::bigint) AS lag
          FROM sync_mutations
          WHERE applied_at > now() - interval '24 hours'
            AND substr(id::text, 15, 1) = '7'
        ) lags`)),
    ];
    if (!row || Number(row.samples) === 0) return null;
    return { p50: Number(row.p50), p95: Number(row.p95), samples: Number(row.samples) };
  });

  const slowQueries = await attempt(async () => {
    const [installed] = [
      ...(await db.execute<{ present: boolean }>(sql`
        SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') AS present`)),
    ];
    if (!installed?.present) return null;
    const rows = [
      ...(await db.execute<{
        query: string;
        calls: number | string;
        mean_ms: number;
        total_ms: number;
      }>(sql`
        SELECT left(regexp_replace(query, '\\s+', ' ', 'g'), 160) AS query, calls,
               mean_exec_time AS mean_ms, total_exec_time AS total_ms
        FROM pg_stat_statements
        WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
          AND calls > 10
        ORDER BY mean_exec_time DESC
        LIMIT 8`)),
    ];
    return rows.map((row) => ({
      query: row.query,
      calls: Number(row.calls),
      meanMs: Number(row.mean_ms),
      totalMs: Number(row.total_ms),
    }));
  });

  const [mcp, feedback] = await Promise.all([probeMcp(fetchImpl), checkFeedbackToken(fetchImpl)]);
  const region = process.env.VERCEL_REGION ?? null;
  const services: ServiceStatus[] = [
    // This page rendering is the web app answering.
    { name: "Web app", detail: region ? `Vercel · ${region}` : "Vercel", state: "healthy" },
    mcp,
    {
      name: "Postgres",
      detail: databaseBytes === null ? "Supabase · no answer" : `Supabase · ${dbMs} ms`,
      state: databaseBytes === null ? "down" : dbMs > SLOW_MS ? "degraded" : "healthy",
    },
    {
      name: "GitHub feedback",
      detail: feedback === "failing" ? "Token refused" : "Issues for in-app feedback",
      state: feedback === "ok" ? "healthy" : feedback === "failing" ? "down" : "not_configured",
    },
  ];

  return {
    checkedAt: new Date().toISOString(),
    databaseBytes,
    connections,
    syncLag,
    deploy: {
      version: APP_VERSION,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      region,
      builtAt: process.env.JIM_BUILT_AT ?? null,
    },
    slowQueries,
    services,
  };
}

/** The p50 sync lag over the last day, for the Overview's "Right now". */
export async function loadSyncLagP50(db: DbOrTx = serviceDb()): Promise<number | null> {
  return attempt(async () => {
    const [row] = [
      ...(await db.execute<{ p50: number | null }>(sql`
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY greatest(0,
          extract(epoch FROM applied_at) * 1000
          - ('x' || translate(left(id::text, 13), '-', ''))::bit(48)::bigint)) AS p50
        FROM sync_mutations
        WHERE applied_at > now() - interval '24 hours' AND substr(id::text, 15, 1) = '7'`)),
    ];
    return row?.p50 === null || row?.p50 === undefined ? null : Number(row.p50);
  });
}
