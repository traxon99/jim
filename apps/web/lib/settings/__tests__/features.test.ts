import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../defaults";
import { needsSetup, showsPaceTracker, showsRpe } from "../features";

describe("showsRpe", () => {
  it("shows RPE in Advanced mode", () => {
    expect(showsRpe({ advancedFeatures: true, dprEnabled: false })).toBe(true);
  });

  it("hides RPE in Simple mode", () => {
    expect(showsRpe({ advancedFeatures: false, dprEnabled: false })).toBe(false);
  });

  it("keeps RPE in Simple mode while PRP is on, since PRP reads it", () => {
    expect(showsRpe({ advancedFeatures: false, dprEnabled: true })).toBe(true);
  });

  it("treats a row cached before the setting existed as Advanced", () => {
    const { advancedFeatures: _, ...old } = DEFAULT_SETTINGS;
    expect(showsRpe(old as typeof DEFAULT_SETTINGS)).toBe(true);
  });
});

describe("showsPaceTracker", () => {
  it("follows its own switch in Advanced mode", () => {
    expect(showsPaceTracker({ advancedFeatures: true, showPaceTracker: true })).toBe(true);
    expect(showsPaceTracker({ advancedFeatures: true, showPaceTracker: false })).toBe(false);
  });

  it("is hidden in Simple mode", () => {
    expect(showsPaceTracker({ advancedFeatures: false, showPaceTracker: true })).toBe(false);
  });
});

describe("needsSetup", () => {
  it("opens setup for a server row that hasn't onboarded", () => {
    expect(needsSetup({ onboardedAt: null })).toBe(true);
  });

  it("doesn't once setup is finished or skipped", () => {
    expect(needsSetup({ onboardedAt: new Date() })).toBe(false);
  });

  it("waits while settings haven't loaded yet", () => {
    expect(needsSetup(undefined)).toBe(false);
  });

  it("ignores a row cached before the field existed", () => {
    expect(needsSetup({} as { onboardedAt: Date | null })).toBe(false);
  });
});
