import type { BodyMeasurementRow } from "@/lib/db/schema";
import { describe, expect, it } from "vitest";
import { buildPortalBodyData, summarizeTrend, toTrendPoints, trendPointsSince } from "../body-data";

function row(overrides: Partial<BodyMeasurementRow>): BodyMeasurementRow {
  return {
    id: "m1",
    kind: "bodyweight",
    value: "180.00",
    unit: "lb",
    measuredAt: new Date("2026-03-01T08:00:00Z"),
    deletedAt: null,
    ...overrides,
  } as BodyMeasurementRow;
}

describe("buildPortalBodyData", () => {
  it("returns live weigh-ins in the user's units, oldest first", () => {
    const data = buildPortalBodyData(
      [
        row({ id: "b", measuredAt: new Date("2026-03-05T08:00:00Z"), value: "80.00", unit: "kg" }),
        row({ id: "a" }),
        row({ id: "gone", deletedAt: new Date() }),
        row({ id: "waist", kind: "waist", value: "32.00", unit: "in" }),
      ],
      "lb",
    );
    expect(data.bodyweight.map((point) => point.id)).toEqual(["a", "b"]);
    expect(data.bodyweight[1]?.value).toBeCloseTo(176.37, 1);
  });
});

describe("summarizeTrend", () => {
  const points = toTrendPoints([
    { id: "a", measuredAt: "2026-01-01T08:00:00Z", value: 185 },
    { id: "b", measuredAt: "2026-02-01T08:00:00Z", value: 179 },
    { id: "c", measuredAt: "2026-03-01T08:00:00Z", value: 181 },
  ]);

  it("measures the change from the range's first entry", () => {
    expect(summarizeTrend(points)).toMatchObject({
      change: -4,
      lowest: 179,
      highest: 185,
      count: 3,
    });
    const recent = trendPointsSince(points, new Date("2026-01-15T00:00:00Z"));
    expect(recent.map((point) => point.id)).toEqual(["b", "c"]);
    expect(summarizeTrend(recent)?.change).toBe(2);
  });

  it("is null with nothing in range", () => {
    expect(summarizeTrend(trendPointsSince(points, new Date("2027-01-01")))).toBeNull();
    expect(trendPointsSince(points, null)).toHaveLength(3);
  });
});
