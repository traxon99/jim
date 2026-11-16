import type { DashboardRange, Rating } from "@jim/db/admin";
import Link from "next/link";

/**
 * The pieces the admin dashboards (issue #810) share: a card, a KPI tile,
 * link tabs for ranges and filters, and a status pill. All render on the
 * server; the tabs are links, so a filter is a URL and survives a reload.
 */

export function AdminCard({
  title,
  aside,
  children,
  className = "",
}: {
  title?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`min-w-0 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
    >
      {(title || aside) && (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {aside && <div className="shrink-0 text-sm text-zinc-500">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function KpiGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;
}

/** A headline number with an optional change or note beside it. */
export function KpiTile({
  label,
  value,
  change,
  note,
}: {
  label: string;
  value: React.ReactNode;
  /** A signed change; positive reads green, negative red, unless `goodWhenUp` is false. */
  change?: { text: string; direction: "up" | "down" | "flat"; goodWhenUp?: boolean } | null;
  note?: React.ReactNode;
}) {
  const good = change ? (change.direction === "up") === (change.goodWhenUp ?? true) : false;
  return (
    <div className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="truncate text-sm text-zinc-500">{label}</p>
      <p className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-2">
        <span className="text-2xl font-semibold tabular-nums md:text-3xl">{value}</span>
        {change && (
          <span
            className={`text-sm font-medium tabular-nums ${
              change.direction === "flat"
                ? "text-zinc-500"
                : good
                  ? "text-green-700 dark:text-green-400"
                  : "text-red-700 dark:text-red-400"
            }`}
          >
            {change.text}
          </span>
        )}
        {note && <span className="text-sm text-zinc-500">{note}</span>}
      </p>
    </div>
  );
}

/** "+12%" against the period before, or null when there's nothing to compare. */
export function percentChangeBadge(
  percent: number | null,
): { text: string; direction: "up" | "down" | "flat" } | null {
  if (percent === null) return null;
  if (percent === 0) return { text: "0%", direction: "flat" };
  return {
    text: `${percent > 0 ? "+" : "−"}${Math.abs(percent)}%`,
    direction: percent > 0 ? "up" : "down",
  };
}

/** A row of link tabs; the current one is filled. */
export function LinkTabs({
  label,
  items,
}: {
  label: string;
  items: { id: string; label: string; href: string; current: boolean }[];
}) {
  return (
    <nav
      aria-label={label}
      className="flex max-w-full overflow-x-auto rounded-xl border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          aria-current={item.current ? "true" : undefined}
          className={`flex min-h-9 shrink-0 items-center rounded-lg px-3 text-sm ${
            item.current
              ? "bg-zinc-900 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "text-zinc-600 dark:text-zinc-400"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/** Range tabs for a page whose other params are in `params`. */
export function RangeTabs({
  path,
  ranges,
  current,
  fallback,
  params = {},
}: {
  path: string;
  ranges: readonly DashboardRange[];
  current: DashboardRange;
  fallback: string;
  params?: Record<string, string | null>;
}) {
  return (
    <LinkTabs
      label="Time range"
      items={ranges.map((range) => ({
        id: range.id,
        label: range.label,
        current: range.id === current.id,
        href: dashboardHref(path, { ...params, range: range.id === fallback ? null : range.id }),
      }))}
    />
  );
}

/** `path` with the non-null params as its query. */
export function dashboardHref(path: string, params: Record<string, string | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export type PillTone = "good" | "warn" | "bad" | "neutral";

const PILL_TONES: Record<PillTone, { pill: string; dot: string }> = {
  good: {
    pill: "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300",
    dot: "bg-green-600 dark:bg-green-400",
  },
  warn: {
    pill: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    dot: "bg-amber-600 dark:bg-amber-400",
  },
  bad: {
    pill: "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300",
    dot: "bg-red-600 dark:bg-red-400",
  },
  neutral: {
    pill: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    dot: "bg-zinc-400 dark:bg-zinc-500",
  },
};

export const RATING_TONES: Record<Rating, PillTone> = { good: "good", fair: "warn", poor: "bad" };

/** A status in words with a dot, never color alone. */
export function StatusPill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  const styles = PILL_TONES[tone];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-medium tabular-nums ${styles.pill}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} aria-hidden="true" />
      {children}
    </span>
  );
}

/** A neutral label chip, like a failure's source. */
export function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex shrink-0 rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
      {children}
    </span>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-zinc-500">{children}</p>;
}
