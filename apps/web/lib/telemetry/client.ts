import { APP_VERSION } from "@/lib/version";
import { type ClientTelemetryEvent, TELEMETRY_MAX_BATCH, telemetryRoute } from "@jim/core";

/**
 * The phone's side of self-hosted telemetry (issue #809). Events queue in
 * memory and leave in one sendBeacon when the app goes to the background,
 * or every `FLUSH_MS` while it's open, so reporting never waits on the
 * network and never gets in the way of logging a set. Anything that fails is
 * dropped: telemetry is never retried and never stored on the phone.
 */

const FLUSH_MS = 30_000;
/** One page load reports the same failure at most this often, so a render loop can't flood. */
const MAX_REPEATS = 3;
export const TELEMETRY_ENDPOINT = "/api/telemetry";

type Sender = (url: string, body: string) => boolean;

let queue: ClientTelemetryEvent[] = [];
const seen = new Map<string, number>();
let started = false;

function defaultSender(url: string, body: string): boolean {
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    return navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
  }
  if (typeof fetch === "function") {
    void fetch(url, { method: "POST", body, keepalive: true }).catch(() => {});
    return true;
  }
  return false;
}

let send: Sender = defaultSender;

/** The path with ids taken out, so one screen groups as one: /workout/:id. */
export const routeOf = telemetryRoute;

/** Queues one event. Safe to call anywhere, including before the app has started. */
export function reportTelemetry(event: Omit<ClientTelemetryEvent, "appVersion" | "path">): void {
  try {
    if (event.kind === "error" || event.kind === "sync_failure") {
      const key = `${event.kind}|${event.name}|${event.message ?? ""}`;
      const count = (seen.get(key) ?? 0) + 1;
      seen.set(key, count);
      if (count > MAX_REPEATS) return;
    }
    if (queue.length >= TELEMETRY_MAX_BATCH) return;
    queue.push({
      ...event,
      appVersion: APP_VERSION,
      path: typeof location === "undefined" ? undefined : routeOf(location.pathname),
    });
    startTelemetry();
  } catch {
    // Telemetry must never break the app.
  }
}

/** Reports a thrown value (an Error or anything else) as a client error. */
export function reportClientError(error: unknown, detail?: Record<string, unknown>): void {
  const err = error instanceof Error ? error : null;
  reportTelemetry({
    kind: "error",
    name: err?.name || "Error",
    message: err ? err.message : String(error),
    stack: err?.stack,
    detail,
  });
}

/** Sends everything queued, in one request. */
export function flushTelemetry(): void {
  if (queue.length === 0) return;
  const events = queue;
  queue = [];
  try {
    send(TELEMETRY_ENDPOINT, JSON.stringify({ events }));
  } catch {
    // Dropped.
  }
}

function startTelemetry(): void {
  if (started || typeof document === "undefined") return;
  started = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushTelemetry();
  });
  setInterval(flushTelemetry, FLUSH_MS);
}

/** Tests only: swaps the sender and clears the queue and repeat counts. */
export function resetTelemetryForTests(sender: Sender): void {
  queue = [];
  seen.clear();
  send = sender;
}
