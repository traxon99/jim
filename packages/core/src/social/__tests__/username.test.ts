import { describe, expect, it } from "vitest";
import { defaultUsernameFromEmail, normalizeUsername, usernameError } from "../username";

describe("normalizeUsername", () => {
  it("trims, drops a leading @ and lowercases", () => {
    expect(normalizeUsername("  @Jane.Doe ")).toBe("jane.doe");
  });
});

describe("usernameError", () => {
  it("accepts letters, numbers, dots, dashes and underscores", () => {
    expect(usernameError("jane_doe-1.x")).toBeNull();
  });

  it("rejects names that are too short or too long", () => {
    expect(usernameError("ab")).toMatch(/at least/);
    expect(usernameError("a".repeat(31))).toMatch(/at most/);
  });

  it("rejects other characters", () => {
    expect(usernameError("jane doe")).toMatch(/only letters/);
    expect(usernameError("jane+gym")).toMatch(/only letters/);
  });
});

describe("defaultUsernameFromEmail", () => {
  it("uses the part of the email before the @", () => {
    expect(defaultUsernameFromEmail("Jackson.Y@example.com")).toBe("jackson.y");
  });

  it("drops characters a username can't hold", () => {
    expect(defaultUsernameFromEmail("jane+gym@example.com")).toBe("janegym");
  });

  it("falls back to 'user' when nothing usable is left", () => {
    expect(defaultUsernameFromEmail("+++@example.com")).toBe("user");
  });
});
