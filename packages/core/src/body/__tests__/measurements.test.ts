import { describe, expect, it } from "vitest";
import {
  bodyweightOn,
  convertMeasurement,
  displayUnitFor,
  isMeasurementKind,
  measurementUnitLabel,
} from "../measurements";

describe("displayUnitFor", () => {
  it("follows the user's weight units for lengths and uses percent for body fat", () => {
    expect(displayUnitFor("bodyweight", "kg")).toBe("kg");
    expect(displayUnitFor("waist", "lb")).toBe("in");
    expect(displayUnitFor("calves", "kg")).toBe("cm");
    expect(displayUnitFor("body_fat", "lb")).toBe("pct");
    expect(measurementUnitLabel("pct")).toBe("%");
  });
});

describe("convertMeasurement", () => {
  it("converts within a dimension and refuses across them", () => {
    expect(convertMeasurement(10, "in", "cm")).toBe(25.4);
    expect(convertMeasurement(100, "cm", "in")).toBe(39.37);
    expect(convertMeasurement(100, "kg", "lb")).toBe(220.46);
    expect(convertMeasurement(18, "pct", "pct")).toBe(18);
    expect(convertMeasurement(32, "in", "lb")).toBeNull();
    expect(convertMeasurement(18, "pct", "cm")).toBeNull();
  });
});

describe("isMeasurementKind", () => {
  it("knows the kinds", () => {
    expect(isMeasurementKind("thighs")).toBe(true);
    expect(isMeasurementKind("biceps")).toBe(false);
  });
});

describe("bodyweightOn", () => {
  const series = [
    { measuredAt: new Date(2024, 0, 10, 8), value: 180 },
    { measuredAt: new Date(2024, 1, 10, 8), value: 175 },
  ];

  it("uses the latest weigh-in on or before the day", () => {
    expect(bodyweightOn(series, new Date(2024, 0, 20))).toBe(180);
    expect(bodyweightOn(series, new Date(2024, 1, 10, 6))).toBe(175);
    expect(bodyweightOn(series, new Date(2025, 0, 1))).toBe(175);
  });

  it("falls back to the first weigh-in before any, and null with none", () => {
    expect(bodyweightOn(series, new Date(2023, 5, 1))).toBe(180);
    expect(bodyweightOn([], new Date())).toBeNull();
  });
});
