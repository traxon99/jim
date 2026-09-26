"use client";

import { CONTEXT_MENU_ALLOWED_SELECTOR, shouldSuppressContextMenu } from "@/lib/pwa/context-menu";
import { KEYBOARD_TARGET_SELECTOR, shouldResetDocumentScroll } from "@/lib/pwa/keyboard-scroll";
import { STANDALONE_MEDIA_QUERY, isStandalone } from "@/lib/pwa/standalone";
import { useEffect } from "react";

/**
 * The browser behaviors that give an installed app away and can't be turned
 * off from CSS alone: the long-press context menu, the document scroll iOS
 * leaves behind after the keyboard closes, and the `pwa` body class that gates
 * the CSS half of this (see app/globals.css). All stay off in a plain browser
 * tab, where taking them away is hostile rather than native.
 */
export function PwaChrome() {
  useEffect(() => {
    const syncBodyClass = () => document.body.classList.toggle("pwa", isStandalone());
    syncBodyClass();

    const onContextMenu = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const suppress = shouldSuppressContextMenu({
        standalone: isStandalone(),
        shiftKey: event.shiftKey,
        onAllowedTarget: target?.closest(CONTEXT_MENU_ALLOWED_SELECTOR) != null,
        hasSelection: (window.getSelection()?.toString().length ?? 0) > 0,
      });
      if (suppress) event.preventDefault();
    };

    // iOS scrolls the (otherwise unscrollable) document to lift a focused
    // input above the keyboard and doesn't always scroll it back, stranding
    // the bottom bars partway up the screen (issue #205). Checked on the next
    // frame after blur so focus hopping between inputs isn't mistaken for the
    // keyboard closing, and again whenever the visual viewport resizes or the
    // document scrolls, since iOS sometimes re-applies the offset mid-dismiss.
    let frame = 0;
    const scheduleScrollReset = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const reset = shouldResetDocumentScroll({
          standalone: isStandalone(),
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          keyboardTargetFocused: document.activeElement?.matches(KEYBOARD_TARGET_SELECTOR) ?? false,
        });
        if (reset) window.scrollTo(0, 0);
      });
    };

    const query = window.matchMedia(STANDALONE_MEDIA_QUERY);
    query.addEventListener("change", syncBodyClass);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("focusout", scheduleScrollReset);
    window.addEventListener("scroll", scheduleScrollReset);
    window.visualViewport?.addEventListener("resize", scheduleScrollReset);

    return () => {
      cancelAnimationFrame(frame);
      query.removeEventListener("change", syncBodyClass);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("focusout", scheduleScrollReset);
      window.removeEventListener("scroll", scheduleScrollReset);
      window.visualViewport?.removeEventListener("resize", scheduleScrollReset);
    };
  }, []);

  return null;
}
