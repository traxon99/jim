import { shouldResetDocumentScroll } from "@/lib/pwa/keyboard-scroll";
import { describe, expect, it } from "vitest";

const base = { standalone: true, scrollX: 0, scrollY: 0, keyboardTargetFocused: false };

describe("shouldResetDocumentScroll", () => {
  it("resets a leftover offset once the keyboard is gone", () => {
    expect(shouldResetDocumentScroll({ ...base, scrollY: 280 })).toBe(true);
    expect(shouldResetDocumentScroll({ ...base, scrollX: 4 })).toBe(true);
  });

  it("leaves the offset alone while an input still holds the keyboard", () => {
    expect(shouldResetDocumentScroll({ ...base, scrollY: 280, keyboardTargetFocused: true })).toBe(
      false,
    );
  });

  it("does nothing when the document is already at the top", () => {
    expect(shouldResetDocumentScroll(base)).toBe(false);
  });

  it("never interferes in a browser tab", () => {
    expect(shouldResetDocumentScroll({ ...base, standalone: false, scrollY: 280 })).toBe(false);
  });
});
