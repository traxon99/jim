"use client";

import { useEffect, useState } from "react";

const CHECK_INTERVAL_MS = 60_000;

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** `current` if `now` is still the same local day, else `now`. */
export function sameDayOrNow(current: Date, now: Date): Date {
  return dayKey(current) === dayKey(now) ? current : now;
}

/**
 * "Now", refreshed whenever the local date has changed (#523). iOS suspends
 * the installed app rather than killing it (docs/PWA.md §8), so a `new
 * Date()` taken once at mount can still be yesterday the next morning. This
 * moves to the current time whenever the app comes back to the foreground,
 * and at midnight while it's open (checked once a minute). In between it
 * keeps the same Date, so it's safe in memo deps.
 */
export function useToday(): Date {
  const [today, setToday] = useState(() => new Date());

  useEffect(() => {
    const refreshOnNewDay = () => {
      const now = new Date();
      setToday((current) => sameDayOrNow(current, now));
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") setToday(new Date());
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    const interval = setInterval(refreshOnNewDay, CHECK_INTERVAL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearInterval(interval);
    };
  }, []);

  return today;
}
