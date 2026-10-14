/** The subset of `PushSubscription.toJSON()` the server needs to send a push. */
export interface PushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Hosts of the browser vendors' push services. Entries match the hostname or any subdomain. */
const PUSH_SERVICE_HOSTS = [
  "push.apple.com", // web.push.apple.com and *.push.apple.com
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "notify.windows.com",
];

/**
 * Push services only ever hand out https endpoints on their own hosts. Anything else would make
 * the server POST to an attacker-chosen URL (SSRF), so match the hostname exactly or by dot-suffix.
 */
function isPushServiceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return PUSH_SERVICE_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

export function isPushSubscriptionPayload(body: unknown): body is PushSubscriptionPayload {
  if (typeof body !== "object" || body === null) return false;
  const candidate = body as Record<string, unknown>;
  if (!isNonEmptyString(candidate.endpoint) || !isPushServiceUrl(candidate.endpoint)) return false;
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
