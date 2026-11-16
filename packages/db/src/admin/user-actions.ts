import { isAssignableRole, normalizeUsername, usernameError } from "@jim/core";
import { eq, sql } from "drizzle-orm";
import { type DbOrTx, users } from "../index";
import { recordAdminAction } from "./audit";
import { parseProfilePatch } from "./profile-patch";
import {
  type SettingsPayload,
  isValidSettingsPatch,
  toSettingsColumns,
  toSettingsPayload,
} from "./settings";

/**
 * What an admin can do to another account (issue #807). Each runs on the
 * server's own connection, so callers must have passed requireAdmin() (or,
 * for the MCP tools, its equivalent) first. Every change and its audit row
 * commit together.
 */
export type AdminActionResult = { ok: true } | { ok: false; error: string };

export interface AdminActor {
  id: string;
  via?: "web" | "mcp";
}

const UNIQUE_VIOLATION = "23505";
/** How long "disable sign-in" bans for: effectively forever, until re-enabled. */
const DISABLED_FOR = "100 years";

async function loadRow(tx: DbOrTx, userId: string) {
  const [row] = await tx.select().from(users).where(eq(users.id, userId));
  return row ?? null;
}

/** Applies a settings patch (the same shape and rules as PATCH /api/settings). */
export async function adminUpdateSettings(
  db: DbOrTx,
  actor: AdminActor,
  userId: string,
  body: unknown,
): Promise<AdminActionResult> {
  if (!isValidSettingsPatch(body)) return { ok: false, error: "Invalid settings" };
  // The validator ignores keys it doesn't know (role, say); with nothing it
  // knows left there's nothing to write.
  const columns = toSettingsColumns(body);
  if (Object.keys(columns).length === 0) return { ok: false, error: "Invalid settings" };
  return db.transaction(async (tx) => {
    const before = await loadRow(tx, userId);
    if (!before) return { ok: false, error: "No such account" };
    const [after] = await tx.update(users).set(columns).where(eq(users.id, userId)).returning();
    if (!after) return { ok: false, error: "No such account" };
    const oldPayload = toSettingsPayload(before);
    const newPayload = toSettingsPayload(after);
    for (const key of Object.keys(body) as (keyof SettingsPayload)[]) {
      if (!(key in newPayload)) continue;
      if (JSON.stringify(oldPayload[key]) === JSON.stringify(newPayload[key])) continue;
      await recordAdminAction(tx, {
        actorId: actor.id,
        targetUserId: userId,
        action: "settings.update",
        field: key,
        oldValue: oldPayload[key],
        newValue: newPayload[key],
        via: actor.via,
      });
    }
    return { ok: true };
  });
}

/** Username, display name, bio and sharing. The picture stays the user's own. */
export async function adminUpdateProfile(
  db: DbOrTx,
  actor: AdminActor,
  userId: string,
  body: unknown,
): Promise<AdminActionResult> {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Invalid profile" };
  const { username: rawUsername, ...rest } = body as Record<string, unknown>;
  if ("avatar" in rest) return { ok: false, error: "The picture can't be changed here" };

  let username: string | undefined;
  if (rawUsername !== undefined) {
    if (typeof rawUsername !== "string") return { ok: false, error: "Invalid username" };
    username = normalizeUsername(rawUsername);
    const invalid = usernameError(username);
    if (invalid) return { ok: false, error: invalid };
  }
  let profile: Exclude<ReturnType<typeof parseProfilePatch>, string> = {};
  if (Object.keys(rest).length > 0) {
    const parsed = parseProfilePatch(rest);
    if (typeof parsed === "string") return { ok: false, error: parsed };
    profile = parsed;
  }
  const changes: Record<string, unknown> = { ...profile };
  if (username !== undefined) changes.username = username;
  if (Object.keys(changes).length === 0) return { ok: false, error: "Nothing to change" };

  try {
    return await db.transaction(async (tx) => {
      const before = await loadRow(tx, userId);
      if (!before) return { ok: false, error: "No such account" };
      await tx.update(users).set(changes).where(eq(users.id, userId));
      for (const [field, value] of Object.entries(changes)) {
        const old = before[field as keyof typeof before];
        if (old === value) continue;
        await recordAdminAction(tx, {
          actorId: actor.id,
          targetUserId: userId,
          action: "profile.update",
          field,
          oldValue: old,
          newValue: value,
          via: actor.via,
        });
      }
      return { ok: true } as const;
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "That username is taken" };
    throw error;
  }
}

/** User or Coach only. Admin is granted and taken away by script (ADR-023). */
export async function adminSetRole(
  db: DbOrTx,
  actor: AdminActor,
  userId: string,
  role: unknown,
): Promise<AdminActionResult> {
  if (!isAssignableRole(role)) return { ok: false, error: "Only User or Coach can be set here" };
  return db.transaction(async (tx) => {
    const before = await loadRow(tx, userId);
    if (!before) return { ok: false, error: "No such account" };
    if (before.role === "admin") {
      return { ok: false, error: "An admin's role changes by script only" };
    }
    if (before.role === role) return { ok: true };
    await tx.update(users).set({ role }).where(eq(users.id, userId));
    await recordAdminAction(tx, {
      actorId: actor.id,
      targetUserId: userId,
      action: "role.set",
      field: "role",
      oldValue: before.role,
      newValue: role,
      via: actor.via,
    });
    return { ok: true };
  });
}

/**
 * Disables or re-enables sign-in. Disabling bans the account in Supabase Auth
 * (no new sign-ins or token refreshes) and ends its sessions; its data stays.
 */
export async function adminSetSignInDisabled(
  db: DbOrTx,
  actor: AdminActor,
  userId: string,
  disabled: boolean,
): Promise<AdminActionResult> {
  if (userId === actor.id) return { ok: false, error: "You can't disable your own sign-in" };
  return db.transaction(async (tx) => {
    const before = await loadRow(tx, userId);
    if (!before) return { ok: false, error: "No such account" };
    if (before.role === "admin" && disabled) {
      return { ok: false, error: "Remove admin by script before disabling" };
    }
    if (disabled) {
      await tx.execute(
        sql`UPDATE auth.users SET banned_until = now() + ${DISABLED_FOR}::interval WHERE id = ${userId}`,
      );
      await tx.execute(sql`DELETE FROM auth.sessions WHERE user_id = ${userId}`);
    } else {
      await tx.execute(sql`UPDATE auth.users SET banned_until = NULL WHERE id = ${userId}`);
    }
    await recordAdminAction(tx, {
      actorId: actor.id,
      targetUserId: userId,
      action: disabled ? "signin.disable" : "signin.enable",
      via: actor.via,
    });
    return { ok: true };
  });
}

/** Records a password reset email sent by an admin; the sending is the caller's. */
export async function recordPasswordReset(
  db: DbOrTx,
  actor: AdminActor,
  userId: string,
): Promise<void> {
  await recordAdminAction(db, {
    actorId: actor.id,
    targetUserId: userId,
    action: "password.reset_email",
    via: actor.via,
  });
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  while (current && typeof current === "object") {
    if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
