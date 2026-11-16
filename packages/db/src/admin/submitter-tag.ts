import { createHash } from "node:crypto";

/**
 * A short, stable tag for a feedback submitter (issue #504). The issue tracker
 * may be public, so an issue carries this instead of the user's email; the
 * admin Feedback page (issue #810) matches it back to an account by hashing
 * each user id the same way.
 */
export function submitterTag(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 12);
}

/** The tag in a feedback issue body ("… by user 1a2b3c4d5e6f."), or null. */
export function parseSubmitterTag(body: string | null | undefined): string | null {
  return body?.match(/by user ([0-9a-f]{12})\b/)?.[1] ?? null;
}
