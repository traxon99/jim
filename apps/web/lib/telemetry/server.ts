import {
  type ClientTelemetryEvent,
  TELEMETRY_RETENTION_DAYS,
  type TelemetryKind,
  telemetryFingerprint,
} from "@jim/core";
import { type DbOrTx, telemetryEvents } from "@jim/db";
import { lt, sql } from "drizzle-orm";

/** Failure kinds get a fingerprint; measurements (vitals, cold starts) don't need one. */
const FAILURE_KINDS = new Set<TelemetryKind>([
  "error",
  "sync_failure",
  "server_error",
  "mcp_error",
]);

/**
 * Stores a phone's batch (issue #809), tagged with its user. Runs as that
 * user: the RLS policy only lets a user add rows carrying their own id.
 */
export async function recordClientTelemetry(
  tx: DbOrTx,
  userId: string,
  events: ClientTelemetryEvent[],
): Promise<void> {
  if (events.length === 0) return;
  await tx.insert(telemetryEvents).values(
    events.map((event) => ({
      userId,
      kind: event.kind,
      name: event.name,
      message: event.message ?? null,
      fingerprint: FAILURE_KINDS.has(event.kind)
        ? telemetryFingerprint(event.kind, event.name, event.message, event.stack)
        : null,
      value: event.value ?? null,
      appVersion: event.appVersion ?? null,
      path: event.path ?? null,
      detail: event.stack ? { ...event.detail, stack: event.stack } : (event.detail ?? null),
    })),
  );
}

export interface ServerFailure {
  kind: "server_error" | "mcp_error";
  name: string;
  message: string;
  stack?: string;
  userId?: string | null;
  path?: string | null;
  appVersion?: string | null;
  detail?: Record<string, unknown>;
}

/** Records a failure the server itself saw: a 5xx, or an MCP tool's unexpected error. */
export async function recordServerFailure(db: DbOrTx, failure: ServerFailure): Promise<void> {
  await db.insert(telemetryEvents).values({
    userId: failure.userId ?? null,
    kind: failure.kind,
    name: failure.name.slice(0, 100),
    message: failure.message.slice(0, 1000),
    fingerprint: telemetryFingerprint(failure.kind, failure.name, failure.message, failure.stack),
    appVersion: failure.appVersion ?? null,
    path: failure.path?.slice(0, 200) ?? null,
    detail: {
      ...failure.detail,
      ...(failure.stack ? { stack: failure.stack.slice(0, 4000) } : {}),
    },
  });
}

/** Deletes rows past the retention window. */
export async function pruneTelemetry(db: DbOrTx): Promise<void> {
  await db
    .delete(telemetryEvents)
    .where(
      lt(
        telemetryEvents.createdAt,
        sql`now() - make_interval(days => ${TELEMETRY_RETENTION_DAYS})`,
      ),
    );
}
