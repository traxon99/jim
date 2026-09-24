/** The subset of `PushSubscription.toJSON()` the server needs to send a push. */
export interface PushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Push services only ever hand out https endpoints; anything else is junk or hostile. */
function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function isPushSubscriptionPayload(body: unknown): body is PushSubscriptionPayload {
  if (typeof body !== "object" || body === null) return false;
  const candidate = body as Record<string, unknown>;
  if (!isNonEmptyString(candidate.endpoint) || !isHttpsUrl(candidate.endpoint)) return false;
  const keys = candidate.keys as Record<string, unknown> | null | undefined;
  if (typeof keys !== "object" || keys === null) return false;
  return isNonEmptyString(keys.p256dh) && isNonEmptyString(keys.auth);
}

export function isEndpointPayload(body: unknown): body is { endpoint: string } {
  return (
    typeof body === "object" &&
    body !== null &&
    isNonEmptyString((body as Record<string, unknown>).endpoint)
  );
}
