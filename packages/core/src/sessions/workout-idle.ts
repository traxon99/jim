/**
 * Idle workouts (issue #648): a workout left open with nothing logged gets a
 * "Still working out?" push after `IDLE_REMINDER_MINUTES`, and is ended
 * after the user's auto-end setting. Both count from the workout's last
 * activity, so every set logged pushes them back.
 */

/** Minutes without activity before the "Still working out?" push. */
export const IDLE_REMINDER_MINUTES = 10;

/** The auto-end setting's default, used until the user picks another. */
export const DEFAULT_AUTO_END_MINUTES = 60;

/** The choices Settings offers (null is Off). */
export const AUTO_END_OPTIONS = [30, 45, 60, 90, 120, 180] as const;

/** Bounds the server accepts, so the reminder always comes before the end. */
export const MIN_AUTO_END_MINUTES = 15;
export const MAX_AUTO_END_MINUTES = 12 * 60;

export function isValidAutoEndMinutes(value: unknown): value is number | null {
  if (value === null) return true;
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_AUTO_END_MINUTES &&
    value <= MAX_AUTO_END_MINUTES
  );
}

/**
 * The latest moment anything happened in the workout: starting it, editing
 * it (notes, gym), adding or changing an exercise, or logging a set. A
 * timestamp from another device's clock that runs ahead is capped at `now`,
 * so it can't hold the workout open.
 */
export function lastWorkoutActivity(
  times: Iterable<Date | null | undefined>,
  startedAt: Date,
  now: Date,
): Date {
  let latest = startedAt.getTime();
  for (const time of times) {
    if (time && time.getTime() > latest) latest = time.getTime();
  }
  return new Date(Math.min(latest, Math.max(now.getTime(), startedAt.getTime())));
}

/** When the "Still working out?" push is due. */
export function idleReminderAt(lastActivityAt: Date): Date {
  return new Date(lastActivityAt.getTime() + IDLE_REMINDER_MINUTES * 60_000);
}

/** When the workout ends by itself, or null with auto-end off. */
export function autoEndAt(lastActivityAt: Date, autoEndMinutes: number | null): Date | null {
  if (autoEndMinutes === null || autoEndMinutes <= 0) return null;
  return new Date(lastActivityAt.getTime() + autoEndMinutes * 60_000);
}

export function shouldAutoEnd(
  lastActivityAt: Date,
  autoEndMinutes: number | null,
  now: Date,
): boolean {
  const end = autoEndAt(lastActivityAt, autoEndMinutes);
  return end !== null && now.getTime() >= end.getTime();
}

/** "1 hr", "90 min", "2 hr": how Settings and the notification say a duration. */
export function formatIdleMinutes(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} hr`;
  return `${minutes} min`;
}
