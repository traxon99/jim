/**
 * Self-hosted telemetry (issue #809): the event shapes the app sends to
 * POST /api/telemetry, how a batch is checked, and how an error is
 * fingerprinted so the admin Failures page can group the same failure across
 * users. Shared by the web app and the MCP server.
 */

/** Everything a phone may send. Server errors and MCP tool errors are recorded server-side only. */
export const CLIENT_TELEMETRY_KINDS = ["error", "sync_failure", "vital", "cold_start"] as const;
export type ClientTelemetryKind = (typeof CLIENT_TELEMETRY_KINDS)[number];
export const TELEMETRY_KINDS = [...CLIENT_TELEMETRY_KINDS, "server_error", "mcp_error"] as const;
export type TelemetryKind = (typeof TELEMETRY_KINDS)[number];

/** The Web Vitals the app reports. */
export const TELEMETRY_VITALS = ["LCP", "INP", "CLS", "TTFB", "FCP"] as const;

/** How long rows are kept. */
export const TELEMETRY_RETENTION_DAYS = 30;
/** Most events one request may carry; the rest of a flood is dropped. */
export const TELEMETRY_MAX_BATCH = 50;

const LIMITS = { name: 100, message: 1000, stack: 4000, path: 200, appVersion: 50, detail: 2000 };

export interface ClientTelemetryEvent {
  kind: ClientTelemetryKind;
  name: string;
  message?: string;
  stack?: string;
  value?: number;
  path?: string;
  appVersion?: string;
  detail?: Record<string, unknown>;
}

/** Largest believable value: CLS is unitless, everything else is milliseconds. */
const MAX_VALUE = { CLS: 100, default: 600_000 };

/** The path with ids taken out, so one screen groups as one (/workout/:id) and no share-link id is kept. */
export function telemetryRoute(pathname: string): string {
  return (pathname.split("?")[0] ?? "").replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ":id",
  );
}

function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

/**
 * The events in a POST /api/telemetry body, cleaned: unknown kinds and
 * events without a name are dropped, strings are cut to size, and at most
 * `TELEMETRY_MAX_BATCH` are kept. Null when the body isn't a batch at all.
 */
export function parseTelemetryBatch(body: unknown): ClientTelemetryEvent[] | null {
  const events = (body as { events?: unknown } | null)?.events;
  if (!Array.isArray(events)) return null;
  const parsed: ClientTelemetryEvent[] = [];
  for (const raw of events.slice(0, TELEMETRY_MAX_BATCH)) {
    if (typeof raw !== "object" || raw === null) continue;
    const event = raw as Record<string, unknown>;
    if (!CLIENT_TELEMETRY_KINDS.includes(event.kind as ClientTelemetryKind)) continue;
    const name = clip(event.name, LIMITS.name);
    if (!name) continue;
    const max = event.name === "CLS" ? MAX_VALUE.CLS : MAX_VALUE.default;
    const value =
      typeof event.value === "number" &&
      Number.isFinite(event.value) &&
      event.value >= 0 &&
      event.value <= max
        ? event.value
        : undefined;
    if ((event.kind === "vital" || event.kind === "cold_start") && value === undefined) continue;
    let detail: Record<string, unknown> | undefined;
    if (typeof event.detail === "object" && event.detail !== null && !Array.isArray(event.detail)) {
      const text = JSON.stringify(event.detail);
      if (text.length <= LIMITS.detail) detail = event.detail as Record<string, unknown>;
    }
    parsed.push({
      kind: event.kind as ClientTelemetryKind,
      name,
      message: clip(event.message, LIMITS.message),
      stack: clip(event.stack, LIMITS.stack),
      value,
      path: clip(
        typeof event.path === "string" ? telemetryRoute(event.path) : undefined,
        LIMITS.path,
      ),
      appVersion: clip(event.appVersion, LIMITS.appVersion),
      detail,
    });
  }
  return parsed;
}

/**
 * The message with what varies between occurrences taken out (ids, numbers,
 * quoted values, URLs), so "Row 3f2a… not found" and "Row 9bc1… not found"
 * group together.
 */
export function normalizeErrorMessage(message: string): string {
  return message
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/(["'`]).*?\1/g, "<str>")
    .replace(/\b0x[0-9a-f]+\b/gi, "<n>")
    .replace(/\d+(\.\d+)?/g, "<n>")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The first stack frame that names code, without line and column numbers,
 * query strings or build hashes, which change on every deploy.
 */
export function topStackFrame(stack: string | undefined): string {
  if (!stack) return "";
  for (const line of stack.split("\n")) {
    const frame = line.trim();
    if (!frame.startsWith("at ") && !frame.includes("@")) continue;
    return frame
      .replace(/\?[^):\s]*/g, "")
      .replace(/:\d+(:\d+)?\)?$/g, "")
      .replace(/:\d+(:\d+)?/g, "")
      .replace(/[.-][0-9a-f]{8,}(?=\.js)/gi, "")
      .replace(/^at /, "")
      .replace(/\($/, "")
      .trim();
  }
  return "";
}

/** FNV-1a, 32 bits, as 8 hex digits: short, stable and dependency-free. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Groups one kind of failure: the same kind, name, message shape and top frame. */
export function telemetryFingerprint(
  kind: TelemetryKind,
  name: string,
  message?: string,
  stack?: string,
): string {
  return fnv1a([kind, name, normalizeErrorMessage(message ?? ""), topStackFrame(stack)].join("|"));
}
