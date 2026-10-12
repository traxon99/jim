import { describe, expect, it } from "vitest";
import { isInstallGateExempt } from "../../pwa/install-gate-exempt";
import { PORTAL_SECTIONS, activePortalSection, parseAnalysisRange, portalHref } from "../sections";

describe("activePortalSection", () => {
  it("marks Overview on /portal itself", () => {
    expect(activePortalSection("/portal")).toBe("overview");
  });

  it("marks a section on its own route and anything under it", () => {
    expect(activePortalSection("/portal/exercises")).toBe("exercises");
    expect(activePortalSection("/portal/exercises/some-id")).toBe("exercises");
    expect(activePortalSection("/portal/workouts/some-id")).toBe("workouts");
    expect(activePortalSection("/portal/body")).toBe("body");
    expect(activePortalSection("/portal/records")).toBe("records");
  });

  it("doesn't match a section by prefix alone", () => {
    expect(activePortalSection("/portal/exercisesx")).toBe("overview");
  });
});

describe("parseAnalysisRange", () => {
  it("reads a known range", () => {
    expect(parseAnalysisRange("52w")).toBe("52w");
    expect(parseAnalysisRange("all")).toBe("all");
  });

  it("falls back to the default for anything else", () => {
    expect(parseAnalysisRange(null)).toBe("12w");
    expect(parseAnalysisRange("forever")).toBe("12w");
  });
});

describe("portalHref", () => {
  it("leaves the default range out of the URL", () => {
    expect(portalHref("/portal/exercises", "12w")).toBe("/portal/exercises");
  });

  it("carries any other range", () => {
    expect(portalHref("/portal/exercises", "all")).toBe("/portal/exercises?range=all");
  });
});

describe("portal sections", () => {
  it("are all reachable from a desktop browser", () => {
    for (const section of PORTAL_SECTIONS) {
      expect(isInstallGateExempt(section.href, "")).toBe(true);
    }
  });
});
