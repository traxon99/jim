import { describe, expect, it } from "vitest";
import {
  TELEMETRY_MAX_BATCH,
  normalizeErrorMessage,
  parseTelemetryBatch,
  telemetryFingerprint,
  topStackFrame,
} from "..";

describe("telemetry (#809)", () => {
  it("keeps only well-formed client events, cut to size", () => {
    const events = parseTelemetryBatch({
      events: [
        { kind: "error", name: "TypeError", message: "x".repeat(5000), stack: "at a" },
        { kind: "vital", name: "LCP", value: 1234.5, appVersion: "1.2.3" },
        { kind: "vital", name: "LCP" },
        { kind: "server_error", name: "spoofed" },
        { kind: "error", name: "" },
        { kind: "cold_start", name: "lift", value: Number.NaN },
        "junk",
      ],
    });
    expect(events).toHaveLength(2);
    expect(events?.[0]?.message).toHaveLength(1000);
    expect(events?.[1]).toMatchObject({ kind: "vital", name: "LCP", value: 1234.5 });
    expect(parseTelemetryBatch({})).toBeNull();
    expect(parseTelemetryBatch(null)).toBeNull();
  });

  it("caps a batch", () => {
    const events = Array.from({ length: 80 }, () => ({ kind: "error", name: "E" }));
    expect(parseTelemetryBatch({ events })).toHaveLength(TELEMETRY_MAX_BATCH);
  });

  it("drops oversized detail", () => {
    const [event] =
      parseTelemetryBatch({
        events: [{ kind: "sync_failure", name: "500", detail: { body: "x".repeat(3000) } }],
      }) ?? [];
    expect(event?.detail).toBeUndefined();
  });

  it("normalises what varies between occurrences", () => {
    expect(
      normalizeErrorMessage(
        'Row 3f2a1b9c-1111-4222-8333-944445555666 "Bench" at 42 failed: https://x.test/a?b=1',
      ),
    ).toBe("Row <id> <str> at <n> failed: <url>");
  });

  it("takes the top frame without positions, queries or build hashes", () => {
    const chrome =
      "TypeError: x is undefined\n    at logSet (https://jim.app/_next/static/chunks/app-3f2a9b8c1d.js?v=2:12:345)\n    at other";
    expect(topStackFrame(chrome)).toBe("logSet (https://jim.app/_next/static/chunks/app.js");
    expect(topStackFrame("logSet@https://jim.app/a.js:1:2\nother@b.js")).toBe(
      "logSet@https://jim.app/a.js",
    );
    expect(topStackFrame(undefined)).toBe("");
  });

  it("groups the same failure across users and builds", () => {
    const a = telemetryFingerprint(
      "error",
      "TypeError",
      "Cannot read 'weight' of row 12",
      "at logSet (app-aaaaaaaaaa.js:1:2)",
    );
    const b = telemetryFingerprint(
      "error",
      "TypeError",
      "Cannot read 'weight' of row 99",
      "at logSet (app-bbbbbbbbbb.js:9:9)",
    );
    const other = telemetryFingerprint("error", "RangeError", "Cannot read 'weight' of row 12");
    expect(a).toBe(b);
    expect(a).not.toBe(other);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });
});
