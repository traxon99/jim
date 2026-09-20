"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/workout", label: "Workout" },
  { href: "/routines", label: "Routines" },
  { href: "/history", label: "History" },
  { href: "/exercises", label: "Exercises" },
  { href: "/settings", label: "Settings" },
] as const;

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="flex shrink-0 border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium ${
              active ? "text-zinc-950 dark:text-zinc-50" : "text-zinc-500 dark:text-zinc-500"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
