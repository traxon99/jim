"use client";

import { KEYBOARD_TARGET_SELECTOR, shouldHideTabBar } from "@/lib/pwa/keyboard-scroll";
import { isStandalone } from "@/lib/pwa/standalone";
import { useEffect, useState } from "react";

/**
 * True while the installed app has an input holding the on-screen keyboard,
 * so the tab bar can step aside (#729). Focus leaving is checked one frame
 * later, so hopping between set inputs with the keyboard's arrows doesn't
 * flash the bar back in.
 */
export function useHideTabBarForKeyboard(): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setHidden(
          shouldHideTabBar({
            standalone: isStandalone(),
            keyboardTargetFocused:
              document.activeElement?.matches(KEYBOARD_TARGET_SELECTOR) ?? false,
          }),
        );
      });
    };

    check();
    document.addEventListener("focusin", check);
    document.addEventListener("focusout", check);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("focusin", check);
      document.removeEventListener("focusout", check);
    };
  }, []);

  return hidden;
}
