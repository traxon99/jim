const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Server-to-server callers (no browser, no cookie) that are authenticated some
 * other way. They send no Origin header, so they pass anyway; the exemption
 * keeps that true if a caller ever starts sending one.
 */
const CSRF_EXEMPT_PATHS = ["/api/push/rest-timer/fire", "/api/push/workout-idle/fire"];

/**
 * True when a cookie-authenticated API request looks forged: a mutating /api/*
 * request whose Origin header names a different origin than the one it hit.
 * A missing Origin passes (non-browser callers omit it).
 */
export function isCrossOriginMutation(input: {
  method: string;
  pathname: string;
  origin: string | null;
  requestOrigin: string;
}): boolean {
  if (!input.pathname.startsWith("/api/")) return false;
  if (SAFE_METHODS.has(input.method.toUpperCase())) return false;
  if (CSRF_EXEMPT_PATHS.includes(input.pathname)) return false;
  if (input.origin === null) return false;
  return input.origin !== input.requestOrigin;
}
