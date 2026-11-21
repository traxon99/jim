"use client";

import {
  type KeyboardAnchor,
  type VisibleBand,
  anchorOffset,
  restoredScrollTop,
} from "@/lib/pwa/keyboard-anchor";
import { KEYBOARD_TARGET_SELECTOR } from "@/lib/pwa/keyboard-scroll";
import { isStandalone } from "@/lib/pwa/standalone";
import { type RefObject, useEffect } from "react";

/**
 * Marks a scroller that holds its place. Scrollers nest (Focus view renders
 * inside the shell's), so each one owns only the inputs whose nearest marked
 * scroller is itself; otherwise the shell would chase an input in a fixed
 * overlay it can't move.
 */
export const KEEP_SCROLL_ATTRIBUTE = "data-keep-scroll";

/** How long after the keyboard closes iOS can still move things. */
const SETTLE_MS = 800;

/**
 * Typing never moves the page (#858). While an input in this scroller holds
 * the keyboard, and for a moment after it closes, any scroll iOS makes is
 * undone so the input stays where it was tapped. See `keyboard-anchor.ts`.
 * Installed app only: a browser tab resizes for the keyboard on its own terms.
 */
export function useKeepScrollOnKeyboard(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const scroller = ref.current;
    if (!scroller) return;
    scroller.setAttribute(KEEP_SCROLL_ATTRIBUTE, "");

    let anchor: KeyboardAnchor | null = null;
    let settleUntil = 0;
    let frame = 0;

    const keyboardTarget = (node: EventTarget | null): Element | null =>
      node instanceof Element &&
      node.matches(KEYBOARD_TARGET_SELECTOR) &&
      node.closest(`[${KEEP_SCROLL_ATTRIBUTE}]`) === scroller
        ? node
        : null;

    const visibleBand = (): VisibleBand | null => {
      if (!keyboardTarget(document.activeElement)) return null;
      const rect = scroller.getBoundingClientRect();
      const viewport = window.visualViewport;
      const top = viewport ? viewport.offsetTop : 0;
      const height = viewport ? viewport.height : window.innerHeight;
      return { top: Math.max(rect.top, top), bottom: Math.min(rect.bottom, top + height) };
    };

    const hold = () => {
      if (!anchor) return;
      const keyboardUp = keyboardTarget(document.activeElement) != null;
      if (!keyboardUp && performance.now() > settleUntil) {
        anchor = null;
        return;
      }
      const target = restoredScrollTop({
        anchor,
        scrollTop: scroller.scrollTop,
        inputRect: anchor.element.isConnected ? anchor.element.getBoundingClientRect() : null,
        scrollerTop: scroller.getBoundingClientRect().top,
        visible: visibleBand(),
      });
      if (target != null) scroller.scrollTop = target;
    };
    const scheduleHold = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(hold);
    };

    const onFocusIn = (event: FocusEvent) => {
      if (!isStandalone()) return;
      const element = keyboardTarget(event.target);
      if (!element) return;
      // Hopping to the next input keeps the page where it is too: the new
      // input is pinned where it sits now.
      const offset = anchorOffset(
        element.getBoundingClientRect(),
        scroller.getBoundingClientRect(),
      );
      anchor = offset == null ? null : { element, offset, scrollTop: scroller.scrollTop };
    };
    const onFocusOut = () => {
      if (!anchor) return;
      settleUntil = performance.now() + SETTLE_MS;
      scheduleHold();
    };
    // A drag is the lifter moving the page on purpose: stop holding it.
    const release = () => {
      anchor = null;
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    scroller.addEventListener("scroll", scheduleHold, { passive: true });
    scroller.addEventListener("touchmove", release, { passive: true });
    scroller.addEventListener("wheel", release, { passive: true });
    window.addEventListener("scroll", scheduleHold, { passive: true });
    window.visualViewport?.addEventListener("resize", scheduleHold);
    window.visualViewport?.addEventListener("scroll", scheduleHold);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      scroller.removeEventListener("scroll", scheduleHold);
      scroller.removeEventListener("touchmove", release);
      scroller.removeEventListener("wheel", release);
      window.removeEventListener("scroll", scheduleHold);
      window.visualViewport?.removeEventListener("resize", scheduleHold);
      window.visualViewport?.removeEventListener("scroll", scheduleHold);
    };
  }, [ref]);
}
