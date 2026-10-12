"use client";

import {
  PORTAL_SECTIONS,
  type PortalSectionId,
  activePortalSection,
  parseAnalysisRange,
  portalHref,
} from "@/lib/portal/sections";
import {
  ChevronLeft,
  Dumbbell,
  History,
  LayoutDashboard,
  type LucideIcon,
  Scale,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const ICONS: Record<PortalSectionId, LucideIcon> = {
  overview: LayoutDashboard,
  workouts: History,
  exercises: Dumbbell,
  body: Scale,
};

/**
 * The desktop Analysis nav (issue #470): a sidebar from `md` up, a row of
 * tabs above the content below that. The row scrolls within itself so more
 * sections never widen the page (docs/PWA.md §3).
 */
export function PortalNav({ email }: { email: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = activePortalSection(pathname);
  const range = parseAnalysisRange(searchParams.get("range"));

  return (
    <nav
      aria-label="Analysis"
      className="flex shrink-0 flex-col gap-3 border-b border-zinc-200 px-4 pt-4 md:w-56 md:gap-6 md:border-r md:border-b-0 md:py-6 dark:border-zinc-800"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <Link
          href="/"
          className="flex items-center gap-1 text-sm font-medium text-zinc-500 dark:text-zinc-500"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Jim
        </Link>
        <span className="text-lg font-semibold">Training analysis</span>
        {email && (
          <span className="truncate text-xs text-zinc-500 dark:text-zinc-500">{email}</span>
        )}
      </div>
      <ul className="-mx-1 flex min-w-0 gap-1 overflow-x-auto pb-2 md:mx-0 md:flex-col md:overflow-visible md:pb-0">
        {PORTAL_SECTIONS.map((section) => {
          const Icon = ICONS[section.id];
          const current = section.id === active;
          return (
            <li key={section.id} className="shrink-0">
              <Link
                href={portalHref(section.href, range)}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium ${
                  current
                    ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
                }`}
              >
                <Icon
                  className="hidden h-4 w-4 shrink-0 md:block"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
