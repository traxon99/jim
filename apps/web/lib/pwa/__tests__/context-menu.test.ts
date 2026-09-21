import {
  CONTEXT_MENU_ALLOWED_SELECTOR,
  type ContextMenuContext,
  shouldSuppressContextMenu,
} from "@/lib/pwa/context-menu";
import { describe, expect, it } from "vitest";

/** A long press on plain app chrome, inside the installed app. */
function longPress(overrides: Partial<ContextMenuContext> = {}): ContextMenuContext {
  return {
    standalone: true,
    shiftKey: false,
    onAllowedTarget: false,
    hasSelection: false,
    ...overrides,
  };
}

describe("shouldSuppressContextMenu", () => {
  it("suppresses the menu on app chrome inside the installed app", () => {
    expect(shouldSuppressContextMenu(longPress())).toBe(true);
  });

  it("leaves a plain browser tab alone", () => {
    expect(shouldSuppressContextMenu(longPress({ standalone: false }))).toBe(false);

    // Even where every other signal says suppress.
    expect(
      shouldSuppressContextMenu(
        longPress({ standalone: false, onAllowedTarget: false, hasSelection: false }),
      ),
    ).toBe(false);
  });

  it("keeps shift-click as the desktop escape hatch", () => {
    expect(shouldSuppressContextMenu(longPress({ shiftKey: true }))).toBe(false);
  });

  it("keeps the menu on links, media, and text entry", () => {
    expect(shouldSuppressContextMenu(longPress({ onAllowedTarget: true }))).toBe(false);
  });

  it("keeps the menu when there is a selection to copy", () => {
    expect(shouldSuppressContextMenu(longPress({ hasSelection: true }))).toBe(false);
  });
});

describe("CONTEXT_MENU_ALLOWED_SELECTOR", () => {
  it("covers links, media, text entry, and opted-in regions", () => {
    for (const selector of ["a[href]", "img", "video", "audio", "textarea", ".allow-pwa-select"]) {
      expect(CONTEXT_MENU_ALLOWED_SELECTOR).toContain(selector);
    }
  });

  it("is a comma-separated list closest() can parse", () => {
    // An empty or stray-comma entry makes querySelector throw, and the
    // listener would then suppress every long press in the app.
    const parts = CONTEXT_MENU_ALLOWED_SELECTOR.split(", ");
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(part).toBe(part.trim());
      expect(part).not.toBe("");
      expect(part).not.toContain(",");
    }
  });

  it("excludes disabled text entry, which has nothing to paste into", () => {
    expect(CONTEXT_MENU_ALLOWED_SELECTOR).toContain("textarea:not([disabled])");
    expect(CONTEXT_MENU_ALLOWED_SELECTOR).not.toContain("textarea,");
  });
});
