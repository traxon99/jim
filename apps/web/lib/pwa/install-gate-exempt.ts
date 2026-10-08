export const PORTAL_PATH = "/portal";

/**
 * Password recovery pages. They only talk to Supabase Auth, never IndexedDB,
 * and the reset email often opens in a plain browser tab even for someone who
 * uses the installed app, so they stay reachable from any browser.
 */
const ACCOUNT_RECOVERY_PATHS = ["/forgot-password", "/reset-password", "/auth/auth-code-error"];

/**
 * The web portal (issue #38, ADR-015) is read-only and reads from the
 * server, never IndexedDB — so none of ADR-010's eviction risk applies and
 * it stays reachable from a desktop browser. Signing in on the way to it
 * (`/login?next=/portal`) is let through too; signing in on the way
 * anywhere else still hits the gate. So is password recovery (#444).
 */
export function isInstallGateExempt(pathname: string, search: string): boolean {
  if (pathname === PORTAL_PATH || pathname.startsWith(`${PORTAL_PATH}/`)) return true;
  if (ACCOUNT_RECOVERY_PATHS.includes(pathname)) return true;
  if (pathname === "/login" || pathname === "/signup") {
    const next = new URLSearchParams(search).get("next");
    return next === PORTAL_PATH || (next?.startsWith(`${PORTAL_PATH}/`) ?? false);
  }
  return false;
}

/**
 * A `?next=` value that's safe to send the user to after an auth step: a path
 * on this origin, never a full or protocol-relative URL.
 */
export function safeNextPath(next: string | string[] | undefined): string {
  if (typeof next !== "string" || !next.startsWith("/")) return "/";
  if (next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
