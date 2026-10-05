import { describe, expect, it } from "vitest";
import {
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
