import { anchorOffset, restoredScrollTop } from "@/lib/pwa/keyboard-anchor";
import { describe, expect, it } from "vitest";

const scroller = { top: 0, bottom: 800 };

describe("anchorOffset", () => {
  it("pins an input that is on screen where it was tapped", () => {
    expect(anchorOffset({ top: 500, bottom: 544 }, scroller)).toBe(500);
  });

  it("leaves an input reached from off screen to iOS", () => {
    expect(anchorOffset({ top: 900, bottom: 944 }, scroller)).toBeNull();
    expect(anchorOffset({ top: -20, bottom: 24 }, scroller)).toBeNull();
  });
});

describe("restoredScrollTop (#858)", () => {
  const anchor = { offset: 500, scrollTop: 1200 };

  it("undoes the scroll iOS leaves behind once the keyboard closes", () => {
    // iOS scrolled the workout 300px down; the input now sits at 200.
    expect(
      restoredScrollTop({
        anchor,
        scrollTop: 1500,
        inputRect: { top: 200, bottom: 244 },
        scrollerTop: 0,
        visible: null,
      }),
    ).toBe(1200);
  });

  it("ignores a document lift, which moves the scroller and the input together", () => {
    expect(
      restoredScrollTop({
        anchor,
        scrollTop: 1200,
        inputRect: { top: 200, bottom: 244 },
        scrollerTop: -300,
        visible: null,
      }),
    ).toBeNull();
  });

  it("holds the input in place while the keyboard is up if it stays visible", () => {
    expect(
      restoredScrollTop({
        anchor: { offset: 100, scrollTop: 1200 },
        scrollTop: 1300,
        inputRect: { top: 0, bottom: 44 },
        scrollerTop: 0,
        visible: { top: 0, bottom: 450 },
      }),
    ).toBe(1200);
  });

  it("lets iOS scroll while the keyboard is up if holding would hide the input", () => {
    expect(
      restoredScrollTop({
        anchor,
        scrollTop: 1500,
        inputRect: { top: 200, bottom: 244 },
        scrollerTop: 0,
        visible: { top: 0, bottom: 450 },
      }),
    ).toBeNull();
  });

  it("falls back to the scroll position when the input has unmounted", () => {
    expect(
      restoredScrollTop({
        anchor,
        scrollTop: 1500,
        inputRect: null,
        scrollerTop: 0,
        visible: null,
      }),
    ).toBe(1200);
    expect(
      restoredScrollTop({
        anchor,
        scrollTop: 1200,
        inputRect: null,
        scrollerTop: 0,
        visible: null,
      }),
    ).toBeNull();
  });

  it("never scrolls above the top", () => {
    expect(
      restoredScrollTop({
        anchor: { offset: 500, scrollTop: 0 },
        scrollTop: 100,
        inputRect: { top: 100, bottom: 144 },
        scrollerTop: 0,
        visible: null,
      }),
    ).toBe(0);
  });
});
