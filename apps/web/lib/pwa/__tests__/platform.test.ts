import { detectInstallPlatform } from "@/lib/pwa/platform";
import { describe, expect, it } from "vitest";

describe("detectInstallPlatform", () => {
  it("detects Android from Chrome's mobile UA", () => {
    expect(
      detectInstallPlatform(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
      ),
    ).toBe("android");
  });

  it("detects iOS from an iPhone UA", () => {
    expect(
      detectInstallPlatform(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("ios");
  });

  it("detects iOS from an iPad UA when the device token is present", () => {
    expect(
      detectInstallPlatform(
        "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("ios");
  });

  it("falls back to other for desktop UAs, including default iPadOS Safari", () => {
    expect(
      detectInstallPlatform(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      ),
    ).toBe("other");
  });

  it("falls back to other for an empty UA", () => {
    expect(detectInstallPlatform("")).toBe("other");
  });
});
