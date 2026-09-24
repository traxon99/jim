"use client";

import { useHasActiveSession } from "@/lib/sessions/use-active-session";
import { BicepsFlexed, CircleUserRound, ClipboardList, Dumbbell, History } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/workout", label: "Workout", Icon: Dumbbell },
  { href: "/routines", label: "Routines", Icon: ClipboardList },
  { href: "/history", label: "History", Icon: History },
  { href: "/exercises", label: "Exercises", Icon: BicepsFlexed },
  { href: "/profile", label: "Profile", Icon: CircleUserRound },
] as const;

export function BottomTabBar() {
  const pathname = usePathname();
  const hasActiveSession = useHasActiveSession();

  return (
    <nav
      className="flex shrink-0 border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
      style={{ paddingBottom: "max(6px, min(env(safe-area-inset-bottom), 34px))" }}
    >
      {TABS.map(({ href, label, Icon }) => {
        const active = pathname.startsWith(href);
        const showActiveSessionDot = href === "/workout" && hasActiveSession;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            data-ripple
            className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium leading-none ${
              active ? "text-accent" : "text-zinc-500 dark:text-zinc-500"
            }`}
          >
            <span className="relative">
              <Icon className="h-7 w-7" strokeWidth={1.75} aria-hidden="true" />
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
  );
}
