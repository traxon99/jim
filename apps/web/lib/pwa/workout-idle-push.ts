// Idle-workout pushes (issue #648): "Still working out?" and "Workout ended".
// Pure request/payload validation, shared by POST /api/push/workout-idle
// (which schedules them) and /api/push/workout-idle/fire (QStash's delayed
// callback), the same split as rest-timer-push.ts.

import { isValidAutoEndMinutes } from "@jim/core";

/** Allowance for the phone's clock running ahead of the server's. */
const FUTURE_TOLERANCE_MS = 60_000;

/** Older activity than this isn't a workout worth reminding about. */
const MAX_ACTIVITY_AGE_MS = 24 * 60 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface WorkoutIdleStartPayload {
  sessionId: string;
  /** ISO timestamp of the workout's last activity, from the device. */
  lastActivityAt: string;
  /** Minutes until the workout ends by itself; null with auto-end off. */
  autoEndMinutes: number | null;
  /** This device's push subscription endpoint: only this device gets the push. */
  endpoint: string;
}

/** Which push a delayed QStash message is for. */
export type WorkoutIdleStage = "remind" | "end";

/** What the delayed QStash message carries back to the fire route. */
export interface WorkoutIdleFirePayload {
  userId: string;
  sessionId: string;
  lastActivityAt: string;
  stage: WorkoutIdleStage;
}

/** Built from the request URL on both sides, like restTimerFireUrl. */
export function workoutIdleFireUrl(requestUrl: string): string {
  return new URL("/api/push/workout-idle/fire", requestUrl).href;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function parseDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Validates the body, or returns null when it's malformed or out of range. */
export function parseWorkoutIdleStart(
  body: unknown,
  now: Date,
): {
  sessionId: string;
  lastActivityAt: Date;
  autoEndMinutes: number | null;
  endpoint: string;
} | null {
  if (typeof body !== "object" || body === null) return null;
  const { sessionId, lastActivityAt, autoEndMinutes, endpoint } = body as Record<string, unknown>;
  if (!isNonEmptyString(sessionId) || !UUID.test(sessionId)) return null;
  if (!isNonEmptyString(lastActivityAt) || !isNonEmptyString(endpoint)) return null;
  if (!isValidAutoEndMinutes(autoEndMinutes)) return null;
  const last = parseDate(lastActivityAt);
  if (!last) return null;
  const ageMs = now.getTime() - last.getTime();
  if (ageMs < -FUTURE_TOLERANCE_MS || ageMs > MAX_ACTIVITY_AGE_MS) return null;
  return { sessionId, lastActivityAt: last, autoEndMinutes, endpoint };
}

export function isWorkoutIdleFirePayload(body: unknown): body is WorkoutIdleFirePayload {
  if (typeof body !== "object" || body === null) return false;
  const { userId, sessionId, lastActivityAt, stage } = body as Record<string, unknown>;
  return (
    isNonEmptyString(userId) &&
    isNonEmptyString(sessionId) &&
    isNonEmptyString(lastActivityAt) &&
    parseDate(lastActivityAt) !== null &&
    (stage === "remind" || stage === "end")
  );
}
