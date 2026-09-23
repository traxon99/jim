export interface WarmupFrequency {
  /** Distinct sessions the warm-up was done in. */
  sessionCount: number;
  /** Distinct sessions within the trailing window (default 30 days). */
  recentSessionCount: number;
  lastDoneAt: Date | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Warm-ups are tracked for how often they're done rather than for progress
 * (issue #59): this is their equivalent of the 1RM chart. Takes current,
 * non-deleted sets tagged with the session they belong to.
 */
export function warmupFrequency(
  sets: readonly { sessionId: string; completedAt: Date }[],
  now: Date,
  windowDays = 30,
): WarmupFrequency {
  const since = now.getTime() - windowDays * DAY_MS;
  const sessions = new Set<string>();
  const recentSessions = new Set<string>();
  let lastDoneAt: Date | null = null;

  for (const set of sets) {
    sessions.add(set.sessionId);
    if (set.completedAt.getTime() >= since) recentSessions.add(set.sessionId);
    if (!lastDoneAt || set.completedAt > lastDoneAt) lastDoneAt = set.completedAt;
  }

  return { sessionCount: sessions.size, recentSessionCount: recentSessions.size, lastDoneAt };
}
