import { describe, expect, it } from "vitest";
import { BASE_TABS, isTabActive } from "../tabs";

describe("isTabActive", () => {
  it("replaces the Profile tab with Home", () => {
    expect(BASE_TABS).toContain("/home");
    expect(BASE_TABS).not.toContain("/profile");
  });

  it("matches a tab's own route and its sub-routes", () => {
    expect(isTabActive("/workout", "/workout")).toBe(true);
    expect(isTabActive("/workout", "/workout/abc")).toBe(true);
    expect(isTabActive("/history", "/history/prs")).toBe(true);
  });

  it("doesn't match a route that only shares a prefix", () => {
    expect(isTabActive("/home", "/homebrew")).toBe(false);
    expect(isTabActive("/routines", "/routinesx")).toBe(false);
  });

  it("keeps Home highlighted on Profile and the screens under it", () => {
    expect(isTabActive("/home", "/home")).toBe(true);
    expect(isTabActive("/home", "/profile")).toBe(true);
    expect(isTabActive("/home", "/profile/settings")).toBe(true);
    expect(isTabActive("/home", "/progression")).toBe(true);
    expect(isTabActive("/home", "/friends")).toBe(true);
    expect(isTabActive("/workout", "/profile")).toBe(false);
  });
});
