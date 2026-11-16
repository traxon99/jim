import { isAdminRole } from "@jim/core";

/**
 * Where a request stands with /admin (issue #806):
 * - "none": not signed in, or signed in but not an admin. /admin answers 404.
 * - "needs-mfa": an admin whose session hasn't passed TOTP yet (aal1).
 * - "ok": an admin on an aal2 session.
 */
export type AdminAccess =
  | { status: "none" }
  | { status: "needs-mfa"; userId: string; email: string }
  | { status: "ok"; userId: string; email: string };

/**
 * Decides access from the verified session claims and the account's stored
 * role. Pure, so the gate's rules are tested without Supabase or Postgres.
 */
export function decideAdminAccess(
  claims: { sub?: unknown; email?: unknown; aal?: unknown } | null | undefined,
  role: unknown,
): AdminAccess {
  const userId = typeof claims?.sub === "string" ? claims.sub : "";
  if (!userId || !isAdminRole(role)) return { status: "none" };
  const email = typeof claims?.email === "string" ? claims.email : "";
  if (claims?.aal !== "aal2") return { status: "needs-mfa", userId, email };
  return { status: "ok", userId, email };
}
