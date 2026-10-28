import { shouldHideTabBar, shouldResetDocumentScroll } from "@/lib/pwa/keyboard-scroll";
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

describe("shouldHideTabBar", () => {
  it("hides the tab bar while an input holds the keyboard in the installed app (#729)", () => {
    expect(shouldHideTabBar({ standalone: true, keyboardTargetFocused: true })).toBe(true);
  });

  it("shows it once the keyboard is gone", () => {
    expect(shouldHideTabBar({ standalone: true, keyboardTargetFocused: false })).toBe(false);
  });

  it("never hides it in a browser tab", () => {
    expect(shouldHideTabBar({ standalone: false, keyboardTargetFocused: true })).toBe(false);
  });
});
