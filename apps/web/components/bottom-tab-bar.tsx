"use client";

import { BicepsFlexed, ClipboardList, Dumbbell, History, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/workout", label: "Workout", Icon: Dumbbell },
  { href: "/routines", label: "Routines", Icon: ClipboardList },
  { href: "/history", label: "History", Icon: History },
  { href: "/exercises", label: "Exercises", Icon: BicepsFlexed },
  { href: "/settings", label: "Settings", Icon: Settings },
] as const;

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="flex shrink-0 border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
      style={{ paddingBottom: "max(6px, min(env(safe-area-inset-bottom), 34px))" }}
    >
      {TABS.map(({ href, label, Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium leading-none ${
              active ? "text-zinc-950 dark:text-zinc-50" : "text-zinc-500 dark:text-zinc-500"
            }`}
          >
            <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
