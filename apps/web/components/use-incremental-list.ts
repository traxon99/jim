"use client";

import { useEffect, useState } from "react";

/** Rows rendered at first, and added each time the end of the list nears. */
export const LIST_PAGE_SIZE = 60;

/**
 * Renders a long list a page at a time (#674). The seeded exercise library is
 * ~870 rows, and drawing every one as a button on each keystroke stuttered on
 * older iPhones mid-workout. The next page loads when the sentinel (put it
 * after the last row) comes within 600 px of the screen. `resetKey` (the
 * query and filters) starts over from the first page.
 */
export function useIncrementalList<T>(items: readonly T[], resetKey: string) {
  const [limit, setLimit] = useState(LIST_PAGE_SIZE);
  const [lastKey, setLastKey] = useState(resetKey);
  if (lastKey !== resetKey) {
    setLastKey(resetKey);
    setLimit(LIST_PAGE_SIZE);
  }

  const [sentinel, setSentinel] = useState<Element | null>(null);
  const hasMore = items.length > limit;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `limit` re-arms the observer, so a sentinel still in view loads another page.
  useEffect(() => {
    if (!sentinel || !hasMore || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setLimit((current) => current + LIST_PAGE_SIZE);
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel, hasMore, limit]);

  return { visible: hasMore ? items.slice(0, limit) : items, hasMore, sentinelRef: setSentinel };
}
