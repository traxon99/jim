/**
 * Personal access tokens (issue #246): long-lived bearer tokens for MCP
 * clients that can't do OAuth (scripts, cron jobs, headless agents). Only a
 * SHA-256 hash is ever stored; the plaintext is shown once, when created.
 *
 * The fixed prefix lets the MCP server tell a PAT from a Supabase access
 * token (a JWT) without a database round trip, and makes a leaked token easy
 * to recognize in logs or secret scanners.
 */
export const ACCESS_TOKEN_PREFIX = "jim_pat_";

/** Expiry choices offered in Settings, in days; null never expires. */
export const ACCESS_TOKEN_EXPIRY_DAYS = [30, 90, 365, null] as const;
export type AccessTokenExpiryDays = (typeof ACCESS_TOKEN_EXPIRY_DAYS)[number];

export const ACCESS_TOKEN_NAME_MAX_LENGTH = 60;

/** How many characters of the plaintext are kept to tell tokens apart in a list. */
const DISPLAY_PREFIX_LENGTH = ACCESS_TOKEN_PREFIX.length + 4;

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A new token: the prefix plus 256 random bits. */
export function generateAccessToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `${ACCESS_TOKEN_PREFIX}${base64Url(bytes)}`;
}

export function isAccessToken(token: string): boolean {
  return token.startsWith(ACCESS_TOKEN_PREFIX);
}

/** Lowercase hex SHA-256 of the token: the only form that's stored. */
export async function hashAccessToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The start of the token, safe to show later ("jim_pat_Ab3x…"). */
export function accessTokenDisplayPrefix(token: string): string {
  return token.slice(0, DISPLAY_PREFIX_LENGTH);
}

export function isAccessTokenExpiryDays(value: unknown): value is AccessTokenExpiryDays {
  return (ACCESS_TOKEN_EXPIRY_DAYS as readonly unknown[]).includes(value);
}

export function accessTokenExpiresAt(days: AccessTokenExpiryDays, now: Date): Date | null {
  return days === null ? null : new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

/** A trimmed name, or an error message. */
export function accessTokenNameError(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === "") return "Give the token a name";
  if (trimmed.length > ACCESS_TOKEN_NAME_MAX_LENGTH) {
    return `Keep the name under ${ACCESS_TOKEN_NAME_MAX_LENGTH} characters`;
  }
  return null;
}
