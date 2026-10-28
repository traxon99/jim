"use client";

import { type CSSProperties, type RefObject, useEffect } from "react";

const DOCKED_CLASS =
  "sticky bottom-0 z-10 flex min-w-0 items-center justify-between gap-3 border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950";

/**
 * Over the tab bar the timer floats as a glass pill of its own, just above the
 * tab pill. As a full-width opaque band it sat on top of the tab bar's sync
 * slot, so the workout showed through the gap under it and it looked like it
 * cut through the exercise cards (#729).
 */
const FLOATING_CLASS =
  "tab-bar-glass sticky z-10 mx-3 flex min-w-0 items-center justify-between gap-3 rounded-[1.75rem] py-2 pl-5 pr-2";

/** Gap between the floating timer and the tab pill under it. */
const FLOATING_GAP = "8px";

export function timerBarClass(aboveTabBar: boolean): string {
  return aboveTabBar ? FLOATING_CLASS : DOCKED_CLASS;
}

export function timerBarStyle(aboveTabBar: boolean): CSSProperties | undefined {
  if (!aboveTabBar) return undefined;
  return { bottom: `calc(var(--tab-pill-height, var(--tab-bar-height, 0px)) + ${FLOATING_GAP})` };
}

/**
 * Publishes the floating timer's height (plus its gap) as
 * `--floating-timer-height`, so the tab bar can lift its sync status above the
 * timer instead of behind it.
 */
export function usePublishFloatingTimerHeight(
  ref: RefObject<HTMLElement | null>,
  aboveTabBar: boolean,
) {
  useEffect(() => {
    const bar = ref.current;
    if (!aboveTabBar || !bar) return;
    const root = document.documentElement;
    const publish = () =>
      root.style.setProperty(
        "--floating-timer-height",
        `calc(${bar.getBoundingClientRect().height}px + ${FLOATING_GAP})`,
      );
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--floating-timer-height");
    };
  }, [ref, aboveTabBar]);
}
