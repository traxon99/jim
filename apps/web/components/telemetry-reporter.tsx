"use client";

import { isBootRevealed, subscribeBootRevealed } from "@/lib/boot/gate";
import { reportTelemetry } from "@/lib/telemetry/client";
import { TELEMETRY_VITALS } from "@jim/core";
import { useReportWebVitals } from "next/web-vitals";
import { useEffect } from "react";

/** The Lift tab: the cold start is measured until it is on screen and usable. */
const LIFT_PATH = "/workout";
const VITALS = new Set<string>(TELEMETRY_VITALS);
/**
 * Each vital once per page load. A remount (React's dev double effects) can
 * register a second observer, which hands over a copy under a new id.
 */
const reported = new Set<string>();

/**
 * Load-time telemetry for the admin Performance page (issue #809): Web
 * Vitals, and on a cold open of the Lift tab, how long until the boot splash
 * lifted and the tab could be used.
 */
export function TelemetryReporter() {
  useReportWebVitals((metric) => {
    if (!VITALS.has(metric.name) || reported.has(metric.name)) return;
    reported.add(metric.name);
    reportTelemetry({
      kind: "vital",
      name: metric.name,
      value: metric.value,
      detail: { rating: metric.rating, navigationType: metric.navigationType },
    });
  });

  useEffect(() => {
    if (document.documentElement.dataset.boot !== "cold") return;
    if (window.location.pathname !== LIFT_PATH) return;
    const report = () =>
      reportTelemetry({ kind: "cold_start", name: "lift", value: performance.now() });
    if (isBootRevealed()) {
      report();
      return;
    }
    const stop = subscribeBootRevealed(() => {
      stop();
      report();
    });
    return stop;
  }, []);

  return null;
}
