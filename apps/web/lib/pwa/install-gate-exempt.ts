export const PORTAL_PATH = "/portal";

/**
 * The web portal (issue #38, ADR-015) is read-only and reads from the
 * server, never IndexedDB — so none of ADR-010's eviction risk applies and
 * it stays reachable from a desktop browser. Signing in on the way to it
 * (`/login?next=/portal`) is let through too; signing in on the way
 * anywhere else still hits the gate.
 */
export function isInstallGateExempt(pathname: string, search: string): boolean {
  if (pathname === PORTAL_PATH || pathname.startsWith(`${PORTAL_PATH}/`)) return true;
  if (pathname === "/login" || pathname === "/signup") {
    const next = new URLSearchParams(search).get("next");
    return next === PORTAL_PATH || (next?.startsWith(`${PORTAL_PATH}/`) ?? false);
  }
  return false;
}
