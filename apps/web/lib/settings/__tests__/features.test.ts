import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../defaults";
import {
  needsSetup,
  showsPaceTracker,
  showsRestStats,
  showsRpe,
  showsSetTimer,
  showsSetTypes,
  showsStrengthHints,
} from "../features";

describe("showsRpe", () => {
  it("shows RPE in Advanced mode", () => {
    expect(showsRpe({ advancedFeatures: true, dprEnabled: false, showRpe: true })).toBe(true);
  });

  it("hides RPE in Simple mode", () => {
    expect(showsRpe({ advancedFeatures: false, dprEnabled: false, showRpe: true })).toBe(false);
  });

  it("keeps RPE in Simple mode while PRP is on, since PRP reads it", () => {
    expect(showsRpe({ advancedFeatures: false, dprEnabled: true, showRpe: true })).toBe(true);
  });

  it("follows its own switch in Advanced mode", () => {
    expect(showsRpe({ advancedFeatures: true, dprEnabled: false, showRpe: false })).toBe(false);
  });

  it("keeps RPE with its switch off while PRP is on", () => {
    expect(showsRpe({ advancedFeatures: true, dprEnabled: true, showRpe: false })).toBe(true);
  });

  it("treats a row cached before the settings existed as Advanced", () => {
    const { advancedFeatures: _, showRpe: __, ...old } = DEFAULT_SETTINGS;
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

describe.each([
  ["showsStrengthHints", showsStrengthHints, "showStrengthHints"],
  ["showsSetTypes", showsSetTypes, "showSetTypes"],
  ["showsRestStats", showsRestStats, "showRestStats"],
] as const)("%s", (_name, shows, key) => {
  it("follows its own switch in Advanced mode", () => {
    expect(shows({ ...DEFAULT_SETTINGS, advancedFeatures: true, [key]: true })).toBe(true);
    expect(shows({ ...DEFAULT_SETTINGS, advancedFeatures: true, [key]: false })).toBe(false);
  });

  it("is hidden in Simple mode", () => {
    expect(shows({ ...DEFAULT_SETTINGS, advancedFeatures: false, [key]: true })).toBe(false);
  });

  it("treats a row cached before the setting existed as on", () => {
    const { [key]: _, ...old } = DEFAULT_SETTINGS;
    expect(shows(old as typeof DEFAULT_SETTINGS)).toBe(true);
  });
});

describe("showsSetTimer", () => {
  it("is off by default", () => {
    expect(showsSetTimer(DEFAULT_SETTINGS)).toBe(false);
  });

  it("follows its own switch in Advanced mode", () => {
    expect(showsSetTimer({ advancedFeatures: true, showSetTimer: true })).toBe(true);
    expect(showsSetTimer({ advancedFeatures: true, showSetTimer: false })).toBe(false);
  });

  it("is hidden in Simple mode", () => {
    expect(showsSetTimer({ advancedFeatures: false, showSetTimer: true })).toBe(false);
  });

  it("treats a row cached before the setting existed as off", () => {
    const { showSetTimer: _, ...old } = DEFAULT_SETTINGS;
    expect(showsSetTimer(old as typeof DEFAULT_SETTINGS)).toBe(false);
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
