"use client";

import { SHELL_SCROLLER_ATTRIBUTE } from "@/components/shell-scroller";
import { type BaseTab, isTabActive } from "@/lib/navigation/tabs";
import { useHideTabBarForKeyboard } from "@/lib/pwa/use-keyboard-open";
import { useHasActiveSession } from "@/lib/sessions/use-active-session";
import {
  BicepsFlexed,
  ClipboardList,
  Dumbbell,
  History,
  House,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef } from "react";

const TABS: readonly { href: BaseTab; label: string; Icon: LucideIcon }[] = [
  { href: "/workout", label: "Workout", Icon: Dumbbell },
  { href: "/routines", label: "Routines", Icon: ClipboardList },
  { href: "/history", label: "History", Icon: History },
  { href: "/exercises", label: "Exercises", Icon: BicepsFlexed },
  { href: "/home", label: "Home", Icon: House },
];

export function BottomTabBar({ syncStatus }: { syncStatus?: ReactNode }) {
  const pathname = usePathname();
  const hasActiveSession = useHasActiveSession();
  const barRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const hiddenForKeyboard = useHideTabBarForKeyboard();

  // The bar floats over the shell's scroller rather than sitting below it, so
  // publish its height for the scroller to clear. The floating workout timers
  // sit just above the pill itself, over the sync slot (#729).
  useEffect(() => {
    const bar = barRef.current;
    const pill = pillRef.current;
    if (!bar || !pill) return;
    const root = document.documentElement;
    const publish = () => {
      const barRect = bar.getBoundingClientRect();
      root.style.setProperty("--tab-bar-height", `${barRect.height}px`);
      root.style.setProperty(
        "--tab-pill-height",
        `${barRect.bottom - pill.getBoundingClientRect().top}px`,
      );
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--tab-bar-height");
      root.style.removeProperty("--tab-pill-height");
    };
  }, []);

  return (
    // A floating Liquid Glass pill: the outer strip only positions it, and
    // lets taps in the gap around the pill fall through to the page. While an
    // input holds the keyboard it fades out rather than unmounting, so its
    // measured height (and the content padding under it) doesn't jump (#729).
    <div
      ref={barRef}
      aria-hidden={hiddenForKeyboard || undefined}
      className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 transition-[opacity,visibility] duration-150 ${
        hiddenForKeyboard ? "invisible opacity-0" : ""
      }`}
      style={{
        paddingLeft: "max(12px, env(safe-area-inset-left))",
        paddingRight: "max(12px, env(safe-area-inset-right))",
        paddingBottom: "max(10px, min(env(safe-area-inset-bottom), 22px))",
      }}
    >
      {/* Reserve the tallest sync row, including its 44px retry target.
          Keep it above the glass pill, clear of the rest timer and workout (#679).
          A floating workout timer takes this spot, so the row lifts above it
          (tab-bar-sync-slot in globals.css, #729). */}
      <div className="tab-bar-sync-slot flex h-13 shrink-0 [&>*]:pointer-events-auto items-center justify-center [&>output]:rounded-full [&>output]:bg-white dark:[&>output]:bg-zinc-950">
        {syncStatus}
      </div>
      <div
        ref={pillRef}
        className="tab-bar-glass pointer-events-auto mx-auto max-w-md rounded-[2rem] p-1.5"
      >
        <nav className="flex gap-1">
          {TABS.map(({ href, label, Icon }) => {
            const active = isTabActive(href, pathname);
            const showActiveSessionDot = href === "/workout" && hasActiveSession;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  // Tapping the tab you're already on scrolls it to the top,
                  // as in every iOS app (#666).
                  if (pathname !== href) return;
                  document
                    .querySelector(`[${SHELL_SCROLLER_ATTRIBUTE}]`)
                    ?.scrollTo({ top: 0, behavior: "smooth" });
                }}
                data-ripple
                className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-full py-1.5 text-[10px] font-medium leading-none ${
                  active ? "tab-bar-glass-active text-accent" : "text-zinc-600 dark:text-zinc-300"
                }`}
              >
                <span className="relative">
                  <Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
                  {showActiveSessionDot && (
                    <span
                      className="workout-indicator-dot absolute -right-1 -top-1 h-2 w-2 rounded-full bg-emerald-500 dark:bg-emerald-400"
                      aria-hidden="true"
                    />
                  )}
                </span>
                {label}
                {showActiveSessionDot && <span className="sr-only"> (workout in progress)</span>}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
