import { describe, expect, it } from "vitest";
import { avatarColor } from "../avatar-color";

describe("avatarColor", () => {
  it("gives the same person the same color every time", () => {
    expect(avatarColor("maya")).toBe(avatarColor("maya"));
    expect(avatarColor("maya")).toMatch(/^bg-\w+-600$/);
  });

  it("spreads different people over the palette", () => {
    const names = ["maya", "theo", "sam.lifts", "dev", "jordan", "priya", "alex"];
    expect(new Set(names.map(avatarColor)).size).toBeGreaterThan(3);
  });

  it("falls back to grey without a username", () => {
    expect(avatarColor(null)).toBe("bg-zinc-500");
  });
});
