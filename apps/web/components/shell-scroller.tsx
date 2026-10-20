"use client";

import { scrollKey } from "@/lib/navigation/tabs";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";

/** Marks the shell's scroller, so the tab bar can scroll it to the top. */
export const SHELL_SCROLLER_ATTRIBUTE = "data-shell-scroller";

/**
 * The shell's one scroller. Every tab and pushed page scrolls in it, so
 * without help they all shared one position: scroll History down, tap
 * Workout, and Workout opened partway down (#666). This remembers the
 * position per page and puts it back when that page shows again, including
 * coming back from a detail page to its list.
 */
export function ShellScroller({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, number>());
  const currentKey = useRef(scrollKey(pathname));

  // Recorded as the user scrolls, not on leaving: by the time a route
  // change commits, the new content may already have clamped scrollTop.
  useEffect(() => {
    const scroller = ref.current;
    if (!scroller) return;
    const record = () => positions.current.set(currentKey.current, scroller.scrollTop);
    scroller.addEventListener("scroll", record, { passive: true });
    return () => scroller.removeEventListener("scroll", record);
  }, []);

  // Before paint, so the new page never shows at the old one's position.
  useLayoutEffect(() => {
    const key = scrollKey(pathname);
    if (key === currentKey.current) return;
    currentKey.current = key;
    const scroller = ref.current;
    if (scroller) scroller.scrollTop = positions.current.get(key) ?? 0;
  }, [pathname]);

  return (
    <div
      ref={ref}
      {...{ [SHELL_SCROLLER_ATTRIBUTE]: "" }}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
    >
      {children}
    </div>
  );
}
