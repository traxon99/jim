/**
 * The rest timer derives from a stored absolute timestamp rather than
 * accumulating `setInterval` ticks (docs/ARCHITECTURE.md §2, platform
 * constraint 4: background timers are unreliable on iOS). Every render just
 * asks "how much time is left between `endsAt` and now" — backgrounding the
 * app for any length of time and coming back recomputes the correct answer
 * instead of drifting.
 */

/** The absolute instant a rest period started now should end. */
export function restEndsAt(now: Date, durationSeconds: number): Date {
  return new Date(now.getTime() + durationSeconds * 1000);
}

/** Seconds remaining until `endsAt`, clamped to zero once it has passed. */
export function remainingRestSeconds(endsAt: Date, now: Date): number {
  const remainingMs = endsAt.getTime() - now.getTime();
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

export function isRestComplete(endsAt: Date, now: Date): boolean {
  return now.getTime() >= endsAt.getTime();
}
