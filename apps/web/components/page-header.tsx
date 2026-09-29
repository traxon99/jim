import { ChevronLeft } from "lucide-react";
import Link from "next/link";

/**
 * Classes for a button or link floating in a PageHeader: a translucent,
 * blurred pill so it reads over whatever is scrolling underneath.
 */
export const FLOATING_BUTTON =
  "flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full border border-zinc-900/10 bg-white/60 text-zinc-800 backdrop-blur-md dark:border-white/15 dark:bg-zinc-900/60 dark:text-zinc-100";

/**
 * Classes for the content below a PageHeader, so every page shares the same
 * side gutter and spacing between sections (issue #313).
 */
export const PAGE_BODY = "flex w-full flex-1 flex-col gap-5 px-4 pt-2 pb-6";

/**
 * The header every top-level page shares. There's no solid bar: the title and
 * any buttons float, pinned below the status bar, and content scrolling under
 * them is blurred and softened by the backdrop (issues #311, #313).
 */
export function PageHeader({
  title,
  back,
  actions,
}: {
  title: string;
  /** Where the back button leads, shown as a pill before the title. */
  back?: { href: string; label: string };
  /** Buttons pinned to the right; style them with FLOATING_BUTTON. */
  actions?: React.ReactNode;
}) {
  return (
    <header className="sticky top-[env(safe-area-inset-top)] z-10 isolate flex w-full items-center gap-3 px-4 pt-3 pb-3 text-left">
      <div aria-hidden="true" className="floating-header-backdrop" />
      {back && (
        <Link
          href={back.href}
          aria-label={`Back to ${back.label}`}
          data-ripple
          className={FLOATING_BUTTON}
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
        </Link>
      )}
      <h1 className="shrink-0 text-3xl font-bold tracking-tight">{title}</h1>
      {actions && (
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">{actions}</div>
      )}
    </header>
  );
}
