import type { AccessTokenExpiryDays } from "@jim/core";
import type { AccessTokenEntry } from "./types";

function shortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** The expiry picker's label for each choice. */
export function expiryLabel(days: AccessTokenExpiryDays): string {
  return days === null ? "No expiry" : `${days} days`;
}

/** "Expires Oct 30, 2026", "Expired Sep 1, 2026" or "Never expires". */
export function describeExpiry(entry: AccessTokenEntry, now: Date = new Date()): string {
  if (!entry.expiresAt) return "Never expires";
  const expiresAt = new Date(entry.expiresAt);
  return `${expiresAt <= now ? "Expired" : "Expires"} ${shortDate(expiresAt)}`;
}

export function isExpired(entry: AccessTokenEntry, now: Date = new Date()): boolean {
  return entry.expiresAt !== null && new Date(entry.expiresAt) <= now;
}

/** "Last used Sep 29, 2026" or "Never used". */
export function describeLastUsed(entry: AccessTokenEntry): string {
  return entry.lastUsedAt ? `Last used ${shortDate(new Date(entry.lastUsedAt))}` : "Never used";
}
