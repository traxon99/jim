"use client";

import { CONTEXT_MENU_ALLOWED_SELECTOR, shouldSuppressContextMenu } from "@/lib/pwa/context-menu";
import { STANDALONE_MEDIA_QUERY, isStandalone } from "@/lib/pwa/standalone";
import { useEffect } from "react";

/**
 * The browser behaviors that give an installed app away and can't be turned
 * off from CSS alone: the long-press context menu, and the `pwa` body class
 * that gates the CSS half of this (see app/globals.css). Both stay off in a
 * plain browser tab, where taking them away is hostile rather than native.
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

    const query = window.matchMedia(STANDALONE_MEDIA_QUERY);
    query.addEventListener("change", syncBodyClass);
    document.addEventListener("contextmenu", onContextMenu);

    return () => {
      query.removeEventListener("change", syncBodyClass);
      document.removeEventListener("contextmenu", onContextMenu);
    };
  }, []);

  return null;
}
