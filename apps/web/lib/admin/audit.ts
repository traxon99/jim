import { type DbOrTx, adminAudit } from "@jim/db";

export type AdminAuditEntry = {
  actorId: string | null;
  targetUserId: string | null;
  action: string;
  field?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  via?: "web" | "mcp" | "script";
};

/**
 * Records one admin write (issue #806). Call it in the same transaction as
 * the write itself, so an action and its audit row land or fail together.
 */
export async function recordAdminAction(tx: DbOrTx, entry: AdminAuditEntry): Promise<void> {
  await tx.insert(adminAudit).values({
    actorId: entry.actorId,
    targetUserId: entry.targetUserId,
    action: entry.action,
    field: entry.field ?? null,
    oldValue: entry.oldValue === undefined ? null : entry.oldValue,
    newValue: entry.newValue === undefined ? null : entry.newValue,
    via: entry.via ?? "web",
  });
}
