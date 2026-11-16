"use client";

const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const DATE_ONLY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/**
 * A timestamp in the viewer's own time zone. The admin pages render on the
 * server, which runs in UTC, so the browser formats it instead; the server's
 * first paint is replaced on hydration.
 */
export function LocalDateTime({ iso, dateOnly = false }: { iso: string; dateOnly?: boolean }) {
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {(dateOnly ? DATE_ONLY : DATE_TIME).format(new Date(iso))}
    </time>
  );
}
