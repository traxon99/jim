// Server-scheduled "Rest complete" push (docs/DECISIONS.md ADR-014). Pure
// request/payload validation, shared by POST /api/push/rest-timer (which
// schedules it) and /api/push/rest-timer/fire (QStash's delayed callback).

/** Longer than any sane rest; guards against a garbage `endsAt` parking a message for days. */
export const MAX_REST_SECONDS = 60 * 60;

/**
 * Small allowance for clock skew between the phone and the server, so a
 * short rest isn't rejected just because the device's clock runs behind.
 * An `endsAt` this far in the past is still accepted and fires immediately.
 */
const PAST_TOLERANCE_MS = 5_000;

export interface RestTimerStartPayload {
  /** ISO timestamp the rest period ends at, computed on the device. */
  endsAt: string;
  /** This device's push subscription endpoint: only this device gets the push. */
  endpoint: string;
}

/** What the delayed QStash message carries back to the fire route. */
export interface RestTimerFirePayload {
  userId: string;
  endsAt: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function parseDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Validates the body and returns the parsed end time, or null when it's malformed or out of range. */
export function parseRestTimerStart(
  body: unknown,
  now: Date,
): { endsAt: Date; endpoint: string } | null {
  if (typeof body !== "object" || body === null) return null;
  const { endsAt, endpoint } = body as Record<string, unknown>;
  if (!isNonEmptyString(endsAt) || !isNonEmptyString(endpoint)) return null;
  const end = parseDate(endsAt);
  if (!end) return null;
  const deltaMs = end.getTime() - now.getTime();
  if (deltaMs < -PAST_TOLERANCE_MS || deltaMs > MAX_REST_SECONDS * 1000) return null;
  return { endsAt: end, endpoint };
}

export function isRestTimerFirePayload(body: unknown): body is RestTimerFirePayload {
  if (typeof body !== "object" || body === null) return false;
  const { userId, endsAt } = body as Record<string, unknown>;
  return isNonEmptyString(userId) && isNonEmptyString(endsAt) && parseDate(endsAt) !== null;
}
