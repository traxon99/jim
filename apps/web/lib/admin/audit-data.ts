import { serviceDb } from "@/lib/db/user-scoped";
import { adminAudit, users } from "@jim/db";
import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export type AuditRow = {
  id: string;
  createdAt: string;
  actor: string | null;
  target: string | null;
  targetUserId: string | null;
  action: string;
  field: string | null;
  oldValue: unknown;
  newValue: unknown;
  via: string;
};

export const AUDIT_PAGE_SIZE = 200;

/**
 * The newest admin actions, with who did them and to whom. Only called after
 * requireAdmin(): this reads every account's rows on the server's connection.
 */
export async function loadAuditLog(limit = AUDIT_PAGE_SIZE): Promise<AuditRow[]> {
  const actor = alias(users, "actor");
  const target = alias(users, "target");
  const rows = await serviceDb()
    .select({
      id: adminAudit.id,
      createdAt: adminAudit.createdAt,
      actorEmail: actor.email,
      actorUsername: actor.username,
      targetEmail: target.email,
      targetUsername: target.username,
      targetUserId: adminAudit.targetUserId,
      action: adminAudit.action,
      field: adminAudit.field,
      oldValue: adminAudit.oldValue,
      newValue: adminAudit.newValue,
      via: adminAudit.via,
    })
    .from(adminAudit)
    .leftJoin(actor, eq(actor.id, adminAudit.actorId))
    .leftJoin(target, eq(target.id, adminAudit.targetUserId))
    .orderBy(desc(adminAudit.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    actor: row.actorUsername ?? row.actorEmail ?? null,
    target: row.targetUsername ?? row.targetEmail ?? null,
    targetUserId: row.targetUserId,
    action: row.action,
    field: row.field,
    oldValue: row.oldValue,
    newValue: row.newValue,
    via: row.via,
  }));
}

/** A stored audit value as one short line: strings bare, the rest as JSON. */
export function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
