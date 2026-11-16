"use client";

import {
  ChevronLeft,
  ClipboardList,
  type IconComponent,
  UsersRound,
} from "@/components/icons/solar";
import { ADMIN_SECTIONS, type AdminSectionId, activeAdminSection } from "@/lib/admin/sections";
import { PORTAL_PATH } from "@/lib/pwa/install-gate-exempt";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS: Record<AdminSectionId, IconComponent> = {
  users: UsersRound,
  audit: ClipboardList,
};

/**
 * The /admin sidebar (issue #806), shaped like the portal's: a sidebar from
 * `md` up, a row of tabs that scrolls within itself below that.
 */
export function AdminNav({ email }: { email: string }) {
  const pathname = usePathname();
  const active = activeAdminSection(pathname);

  return (
    <nav
      aria-label="Admin"
      className="flex shrink-0 flex-col gap-3 border-b border-zinc-200 px-4 pt-4 md:w-56 md:gap-6 md:border-r md:border-b-0 md:py-6 dark:border-zinc-800"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <Link
          href={PORTAL_PATH}
          className="-ml-1 flex min-h-11 items-center gap-1 self-start pr-3 text-base font-medium text-zinc-500 dark:text-zinc-500"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          Training analysis
        </Link>
        <span className="text-lg font-semibold">Admin</span>
        {email && (
          <span className="truncate text-xs text-zinc-500 dark:text-zinc-500">{email}</span>
        )}
      </div>
      <ul className="-mx-1 flex min-w-0 gap-1 overflow-x-auto pb-2 md:mx-0 md:flex-col md:overflow-visible md:pb-0">
        {ADMIN_SECTIONS.map((section) => {
          const Icon = ICONS[section.id];
          const current = section.id === active;
          return (
            <li key={section.id} className="shrink-0">
              <Link
                href={section.href}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium ${
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
