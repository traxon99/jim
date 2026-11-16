import { isAdminRole } from "@jim/core";
import { type DbOrTx, adminAudit, users } from "@jim/db";
import {
  type AdminActionResult,
  type FailureSourceId,
  type FeedbackStateId,
  type FeedbackTypeId,
  type HealthOptions,
  OVERVIEW_RANGES,
  TELEMETRY_RANGES,
  adminRequestAppUpdate,
  adminRequestLocalReset,
  adminSetRole,
  adminSetSignInDisabled,
  adminUpdateProfile,
  adminUpdateSettings,
  listAdminUsers,
  loadAdminUser,
  loadAuditLog,
  loadFailureDetail,
  loadFailures,
  loadFeedback,
  loadHealth,
  loadOverview,
  loadPerformance,
  pickRange,
  recordPasswordReset,
} from "@jim/db/admin";
import { createClient } from "@supabase/supabase-js";
import { and, eq, gte, sql } from "drizzle-orm";
import type { UserContext } from "../context.js";

/**
 * The admin console as MCP tools (issue #811), mirroring /admin one to one
 * over the same shared logic (@jim/db/admin). server.ts only lists them for
 * an admin's session, and every call checks the role again here, so a role
 * taken away mid-session stops working at once. They run on the server's
 * own connection (like /admin), never on /v1, and every write is audited
 * with `via: "mcp"`.
 */

export const ADMIN_ONLY_MESSAGE = "Admins only.";

/** Throws unless the caller's account is an admin right now. */
export async function requireAdmin(context: UserContext): Promise<void> {
  const [row] = await context.db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, context.userId));
  if (!isAdminRole(row?.role)) throw new Error(ADMIN_ONLY_MESSAGE);
}

/** Whether an account is an admin, for deciding which tools to list. */
export async function isAdmin(db: DbOrTx, userId: string): Promise<boolean> {
  const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  return isAdminRole(row?.role);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An account by id, email or username, or a clear error. */
async function resolveAccount(db: DbOrTx, user: string): Promise<{ id: string; email: string }> {
  const term = user.trim();
  const where = UUID.test(term)
    ? eq(users.id, term)
    : sql`lower(${users.email}) = lower(${term}) OR lower(${users.username}) = lower(${term.replace(/^@/, "")})`;
  const rows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(where)
    .limit(2);
  const [first] = rows;
  if (!first) throw new Error(`No account matches "${term}".`);
  return first;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function adminOverview(context: UserContext, input: { range?: string }) {
  await requireAdmin(context);
  const range = pickRange(OVERVIEW_RANGES, input.range, "30d");
  return { range: range.id, ...(await loadOverview(range, context.db)) };
}

export async function adminFailures(
  context: UserContext,
  input: { range?: string; source?: FailureSourceId; fingerprint?: string },
) {
  await requireAdmin(context);
  if (input.fingerprint) {
    const detail = await loadFailureDetail(input.fingerprint, context.db);
    if (!detail) throw new Error(`No failure group "${input.fingerprint}".`);
    return detail;
  }
  const range = pickRange(TELEMETRY_RANGES, input.range, "7d");
  return { range: range.id, ...(await loadFailures(range, input.source ?? null, context.db)) };
}

export async function adminPerformance(context: UserContext, input: { range?: string }) {
  await requireAdmin(context);
  const range = pickRange(TELEMETRY_RANGES, input.range, "7d");
  return { range: range.id, ...(await loadPerformance(range, context.db)) };
}

export async function adminFeedback(
  context: UserContext,
  input: { state?: FeedbackStateId; type?: FeedbackTypeId },
) {
  await requireAdmin(context);
  const result = await loadFeedback(
    { state: input.state ?? "open", type: input.type ?? null },
    context.db,
  );
  if (!result.ok) {
    throw new Error(
      result.reason === "not_configured"
        ? "GitHub feedback isn't set up on the MCP server (GITHUB_FEEDBACK_REPO, GITHUB_FEEDBACK_TOKEN)."
        : "GitHub didn't answer. Try again in a minute.",
    );
  }
  return result.items;
}

/** Health as this server sees it: itself up, the web app probed. */
function mcpHealthOptions(): HealthOptions {
  const region = process.env.FLY_REGION ?? null;
  return {
    self: { name: "jim-mcp", detail: region ? `Fly · ${region}` : "Fly", state: "healthy" },
    peer: {
      name: "Web app",
      host: "Vercel",
      origin: process.env.JIM_WEB_URL || null,
      path: "/api/healthz",
    },
    deploy: {
      version: process.env.FLY_IMAGE_REF?.split(":").pop() ?? "mcp",
      commit: null,
      region,
      builtAt: null,
    },
  };
}

export async function adminHealth(context: UserContext, options = mcpHealthOptions()) {
  await requireAdmin(context);
  return loadHealth(context.db, options);
}

export async function adminListUsers(
  context: UserContext,
  input: { query?: string; sort?: "active" | "joined"; limit?: number },
) {
  await requireAdmin(context);
  return listAdminUsers(context.db, {
    query: input.query?.slice(0, 100),
    sort: input.sort,
    limit: input.limit,
  });
}

export async function adminGetUser(context: UserContext, input: { user: string }) {
  await requireAdmin(context);
  const account = await resolveAccount(context.db, input.user);
  return loadAdminUser(account.id, context.db);
}

export async function adminAuditLog(context: UserContext, input: { limit?: number }) {
  await requireAdmin(context);
  return loadAuditLog(context.db, input.limit);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

class DryRunRollback extends Error {
  constructor(readonly result: AdminActionResult) {
    super("dry run rolled back");
  }
}

/** What a write changed, read back from the audit rows it wrote. */
async function changesBy(tx: DbOrTx, actorId: string) {
  return tx
    .select({
      action: adminAudit.action,
      targetUserId: adminAudit.targetUserId,
      field: adminAudit.field,
      oldValue: adminAudit.oldValue,
      newValue: adminAudit.newValue,
    })
    .from(adminAudit)
    .where(
      and(
        eq(adminAudit.actorId, actorId),
        eq(adminAudit.via, "mcp"),
        // now() is this transaction's start, so only its own rows match.
        gte(adminAudit.createdAt, sql`now()`),
      ),
    );
}

/**
 * Runs one shared admin write in a transaction and answers with the audit
 * rows it wrote. A dry run does the same work and rolls it back, so its
 * preview can't drift from the real call.
 */
async function adminWrite(
  context: UserContext,
  dryRun: boolean,
  write: (tx: DbOrTx) => Promise<AdminActionResult>,
) {
  await requireAdmin(context);
  let preview: Awaited<ReturnType<typeof changesBy>> = [];
  try {
    const changes = await context.db.transaction(async (tx) => {
      const result = await write(tx);
      if (!result.ok) throw new Error(result.error);
      const written = await changesBy(tx, context.userId);
      if (dryRun) {
        preview = written;
        throw new DryRunRollback(result);
      }
      return written;
    });
    return { dryRun: false, changes };
  } catch (error) {
    if (error instanceof DryRunRollback) return { dryRun: true, changes: preview };
    throw error;
  }
}

const actor = (context: UserContext) => ({ id: context.userId, via: "mcp" as const });

export async function adminUpdateUserSettings(
  context: UserContext,
  input: { user: string; settings: Record<string, unknown>; dryRun: boolean },
) {
  await requireAdmin(context);
  const account = await resolveAccount(context.db, input.user);
  return adminWrite(context, input.dryRun, (tx) =>
    adminUpdateSettings(tx, actor(context), account.id, input.settings),
  );
}

export async function adminUpdateUserProfile(
  context: UserContext,
  input: { user: string; profile: Record<string, unknown>; dryRun: boolean },
) {
  await requireAdmin(context);
  const account = await resolveAccount(context.db, input.user);
  return adminWrite(context, input.dryRun, (tx) =>
    adminUpdateProfile(tx, actor(context), account.id, input.profile),
  );
}

export async function adminSetUserRole(
  context: UserContext,
  input: { user: string; role: string; dryRun: boolean },
) {
  await requireAdmin(context);
  const account = await resolveAccount(context.db, input.user);
  return adminWrite(context, input.dryRun, (tx) =>
    adminSetRole(tx, actor(context), account.id, input.role),
  );
}

export async function adminSetUserSignIn(
  context: UserContext,
  input: { user: string; disabled: boolean; dryRun: boolean },
) {
  await requireAdmin(context);
  const account = await resolveAccount(context.db, input.user);
  return adminWrite(context, input.dryRun, (tx) =>
    adminSetSignInDisabled(tx, actor(context), account.id, input.disabled),
  );
}

export async function adminRequestUpdate(
  context: UserContext,
  input: { user?: string; dryRun: boolean },
) {
  await requireAdmin(context);
  const account = input.user ? await resolveAccount(context.db, input.user) : null;
  return adminWrite(context, input.dryRun, (tx) =>
    adminRequestAppUpdate(tx, actor(context), account?.id ?? null),
  );
}

export async function adminRequestReset(
  context: UserContext,
  input: { user: string; dryRun: boolean },
) {
  await requireAdmin(context);
  const account = await resolveAccount(context.db, input.user);
  return adminWrite(context, input.dryRun, (tx) =>
    adminRequestLocalReset(tx, actor(context), account.id),
  );
}

/**
 * Emails the account the same password reset link Forgot password sends,
 * landing on the web app's reset page. A dry run only names who would get it.
 */
export async function adminSendPasswordReset(
  context: UserContext,
  input: { user: string; dryRun: boolean },
  send: (email: string, redirectTo: string) => Promise<{ error: unknown }> = sendResetEmail,
) {
  await requireAdmin(context);
  const account = await resolveAccount(context.db, input.user);
  const web = process.env.JIM_WEB_URL;
  if (!web) throw new Error("Password reset needs JIM_WEB_URL set on the MCP server.");
  if (input.dryRun) return { dryRun: true, email: account.email };
  const redirectTo = new URL("/auth/confirm", web);
  redirectTo.searchParams.set("next", "/reset-password");
  const { error } = await send(account.email, redirectTo.toString());
  if (error) throw new Error("Couldn't send the email. Try again later.");
  await recordPasswordReset(context.db, actor(context), account.id);
  return { dryRun: false, email: account.email };
}

async function sendResetEmail(email: string, redirectTo: string) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required.");
  // A one-off client: nothing about this request should be stored.
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, flowType: "implicit" },
  });
  return supabase.auth.resetPasswordForEmail(email, { redirectTo });
}
