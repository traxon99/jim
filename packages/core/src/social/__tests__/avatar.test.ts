import { describe, expect, it } from "vitest";
import { AVATAR_MAX_LENGTH, isValidAvatar } from "../avatar";

describe("isValidAvatar", () => {
  it("accepts a small image data URL", () => {
    expect(isValidAvatar("data:image/jpeg;base64,/9j/4AAQSkZJRg==")).toBe(true);
    expect(isValidAvatar("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
  });

  it("rejects other types, links and oversized images", () => {
    expect(isValidAvatar("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(isValidAvatar("https://example.com/me.jpg")).toBe(false);
    expect(isValidAvatar(42)).toBe(false);
    expect(isValidAvatar(`data:image/jpeg;base64,${"A".repeat(AVATAR_MAX_LENGTH)}`)).toBe(false);
  });
});
