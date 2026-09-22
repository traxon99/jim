"use client";

import { useEffect } from "react";

const RIPPLE_TARGET_SELECTOR = "button:not(:disabled), [data-ripple]";
const RIPPLE_DURATION_MS = 450;

// Android-style ripple (docs/ARCHITECTURE.md §2 constraint 3: no navigator.vibrate,
// so a splash is the visual stand-in for a haptic). One delegated listener covers
// every button plus [data-ripple] elements, so nothing has to wire this up itself.
export function RippleEffect() {
  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (event.pointerType === "mouse" && event.button !== 0) return;

      const target = (event.target as HTMLElement).closest<HTMLElement>(RIPPLE_TARGET_SELECTOR);
      if (!target) return;

      const rect = target.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const radius = Math.hypot(Math.max(x, rect.width - x), Math.max(y, rect.height - y));

      const ripple = document.createElement("span");
      ripple.className = "tap-ripple";
      ripple.style.width = `${radius * 2}px`;
      ripple.style.height = `${radius * 2}px`;
      ripple.style.left = `${x - radius}px`;
      ripple.style.top = `${y - radius}px`;

      target.appendChild(ripple);
      setTimeout(() => ripple.remove(), RIPPLE_DURATION_MS);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  return null;
}
