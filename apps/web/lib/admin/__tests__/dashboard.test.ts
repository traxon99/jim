import { parseSubmitterTag, submitterTag } from "@jim/db/admin";
import {
  OVERVIEW_RANGES,
  dayKeys,
  fillDays,
  formatBytes,
  formatDuration,
  percentChange,
  pickRange,
  rateMetric,
  versionSpread,
} from "@jim/db/admin";
import { describe, expect, it } from "vitest";

describe("admin dashboard helpers (#810)", () => {
  it("picks a known range and falls back for anything else", () => {
    expect(pickRange(OVERVIEW_RANGES, "7d", "30d").hours).toBe(168);
    expect(pickRange(OVERVIEW_RANGES, "1y", "30d").id).toBe("30d");
    expect(pickRange(OVERVIEW_RANGES, ["90d", "7d"], "30d").id).toBe("90d");
  });

  it("lays rows out on UTC days with zeros for gaps", () => {
    const days = dayKeys(new Date("2026-03-02T23:30:00Z"), 3);
    expect(days).toEqual(["2026-02-28", "2026-03-01", "2026-03-02"]);
    expect(fillDays(days, [{ day: "2026-03-01", count: 4 }])).toEqual([0, 4, 0]);
  });

  it("compares with the period before only when it had something", () => {
    expect(percentChange(112, 100)).toBe(12);
    expect(percentChange(5, 0)).toBeNull();
  });

  it("keeps the most used versions and folds the rest into Other", () => {
    expect(
      versionSpread(
        [
          { version: "v1", users: 1 },
          { version: "v4", users: 6 },
          { version: "v3", users: 2 },
          { version: null, users: 1 },
        ],
        2,
      ),
    ).toEqual([
      { version: "v4", users: 6, share: 60 },
      { version: "v3", users: 2, share: 20 },
      { version: "Other", users: 2, share: 20 },
    ]);
    expect(versionSpread([])).toEqual([]);
  });

  it("formats durations, bytes and rates vitals by p75", () => {
    expect(formatDuration(840)).toBe("840 ms");
    expect(formatDuration(2400)).toBe("2.4 s");
    expect(formatDuration(180_000)).toBe("3 min");
    expect(formatBytes(412 * 1024 * 1024)).toBe("412 MB");
    expect(rateMetric("LCP", 1900)).toBe("good");
    expect(rateMetric("INP", 350)).toBe("fair");
    expect(rateMetric("CLS", 0.3)).toBe("poor");
    expect(rateMetric("unknown", 1)).toBeNull();
  });

  it("reads back the submitter tag the feedback route writes", () => {
    const tag = submitterTag("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    expect(parseSubmitterTag(`Hi\n\n---\nSubmitted from Jim v1.2 by user ${tag}.`)).toBe(tag);
    expect(parseSubmitterTag("No footer")).toBeNull();
  });
});
