"use client";

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/** "12 min ago", "3 h ago", "Yesterday", then the date. */
export function relativeTime(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  if (hours < 48) return "Yesterday";
  return DATE.format(new Date(iso));
}

/** A timestamp relative to the viewer's clock, with the full time on hover. */
export function RelativeTime({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString()} suppressHydrationWarning>
      {relativeTime(iso)}
    </time>
  );
}
