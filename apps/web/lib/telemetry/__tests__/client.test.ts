import { beforeEach, describe, expect, it } from "vitest";
import {
  TELEMETRY_ENDPOINT,
  flushTelemetry,
  reportClientError,
  reportTelemetry,
  resetTelemetryForTests,
  routeOf,
} from "../client";

describe("client telemetry (#809)", () => {
  let sent: { url: string; body: string }[];

  beforeEach(() => {
    sent = [];
    resetTelemetryForTests((url, body) => {
      sent.push({ url, body });
      return true;
    });
  });

  it("batches events into one request, tagged with the build", () => {
    reportTelemetry({ kind: "vital", name: "LCP", value: 1200 });
    reportClientError(new TypeError("x is undefined"));
    expect(sent).toHaveLength(0);
    flushTelemetry();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe(TELEMETRY_ENDPOINT);
    const { events } = JSON.parse(sent[0]?.body ?? "{}");
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      kind: "error",
      name: "TypeError",
      message: "x is undefined",
    });
    expect(events[0].appVersion).toBeTruthy();
    flushTelemetry();
    expect(sent).toHaveLength(1);
  });

  it("reports the same failure at most three times per page load", () => {
    for (let i = 0; i < 10; i++) reportClientError(new Error("loop"));
    flushTelemetry();
    expect(JSON.parse(sent[0]?.body ?? "{}").events).toHaveLength(3);
  });

  it("reports thrown non-errors too", () => {
    reportClientError("plain string");
    flushTelemetry();
    expect(JSON.parse(sent[0]?.body ?? "{}").events[0]).toMatchObject({
      name: "Error",
      message: "plain string",
    });
  });

  it("groups paths by screen", () => {
    expect(routeOf("/workout/01a1e63c-3de3-707b-a9d8-3071ffdd8ec1")).toBe("/workout/:id");
    expect(routeOf("/history")).toBe("/history");
  });

  it("never throws when sending fails", () => {
    resetTelemetryForTests(() => {
      throw new Error("no beacon");
    });
    reportClientError(new Error("x"));
    expect(() => flushTelemetry()).not.toThrow();
  });
});
