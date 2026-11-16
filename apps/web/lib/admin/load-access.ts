import { serviceDb } from "@/lib/db/user-scoped";
import { ADMIN_PATH } from "@/lib/pwa/install-gate-exempt";
import { createClient } from "@/lib/supabase/server";
import { users } from "@jim/db";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { type AdminAccess, decideAdminAccess } from "./access";

export { ADMIN_PATH };
export const ADMIN_MFA_PATH = `${ADMIN_PATH}/mfa`;

/**
 * Reads the verified session and the account's role. The role comes from
 * Postgres on every request rather than from the token, so a demotion takes
 * effect at once. The read is the server's own connection: it's narrowed to
 * the signed-in user's id, which getClaims() has already verified.
 */
export async function loadAdminAccess(): Promise<AdminAccess> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims().catch(() => ({ data: null }));
  const claims = data?.claims;
  const userId = typeof claims?.sub === "string" ? claims.sub : "";
  if (!userId) return { status: "none" };
  const [row] = await serviceDb()
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId));
  return decideAdminAccess(claims, row?.role);
}

/** Admin role required (404 otherwise); TOTP not yet. For the TOTP page itself. */
export async function requireAdminRole() {
  const access = await loadAdminAccess();
  if (access.status === "none") notFound();
  return access;
}

/** Admin role and an aal2 session. Every admin page and action calls this. */
export async function requireAdmin(): Promise<{ userId: string; email: string }> {
  const access = await loadAdminAccess();
  if (access.status === "none") notFound();
  if (access.status === "needs-mfa") redirect(ADMIN_MFA_PATH);
  return { userId: access.userId, email: access.email };
}
