import { describe, expect, it } from "vitest";
import { SPLASH_DEVICES, findSplashDevice, splashMediaQuery } from "../splash-devices";

describe("SPLASH_DEVICES (#672)", () => {
  it("gives every device a unique id and media query", () => {
    expect(new Set(SPLASH_DEVICES.map((device) => device.id)).size).toBe(SPLASH_DEVICES.length);
    expect(new Set(SPLASH_DEVICES.map(splashMediaQuery)).size).toBe(SPLASH_DEVICES.length);
  });

  it.each([
    ["iPhone 16 Pro Max", 440, 956],
    ["iPhone Air", 420, 912],
    ["iPhone 14", 390, 844],
    ["iPhone 14 Plus", 428, 926],
    ["iPhone SE", 375, 667],
  ])("covers the %s screen", (_name, width, height) => {
    expect(
      SPLASH_DEVICES.some((device) => device.cssWidth === width && device.cssHeight === height),
    ).toBe(true);
  });

  it("finds a device by its route id", () => {
    expect(findSplashDevice("iphone-air")?.cssWidth).toBe(420);
    expect(findSplashDevice("pixel-9")).toBeUndefined();
  });
});
