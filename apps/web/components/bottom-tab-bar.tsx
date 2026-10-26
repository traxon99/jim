"use client";

import { SHELL_SCROLLER_ATTRIBUTE } from "@/components/shell-scroller";
import { type BaseTab, isTabActive } from "@/lib/navigation/tabs";
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

  // The bar floats over the shell's scroller rather than sitting below it, so
  // publish its height for the scroller (and the sticky rest timer) to clear.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const root = document.documentElement;
    const publish = () =>
      root.style.setProperty("--tab-bar-height", `${bar.getBoundingClientRect().height}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--tab-bar-height");
    };
  }, []);

  return (
    // A floating Liquid Glass pill: the outer strip only positions it, and
    // lets taps in the gap around the pill fall through to the page.
    <div
      ref={barRef}
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10"
      style={{
        paddingLeft: "max(12px, env(safe-area-inset-left))",
        paddingRight: "max(12px, env(safe-area-inset-right))",
        paddingBottom: "max(10px, min(env(safe-area-inset-bottom), 22px))",
      }}
    >
      <div className="tab-bar-glass pointer-events-auto mx-auto max-w-md rounded-[2rem] p-1.5">
        {syncStatus}
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
