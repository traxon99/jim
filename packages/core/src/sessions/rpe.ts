/**
 * RPE (Rate of Perceived Exertion) scale (issue #163): the app only tracks
 * 5-10 — below that, the label stops being a meaningful signal of effort,
 * so logged values are clamped into range rather than stored as typed.
 */
export const RPE_MIN = 5;
export const RPE_MAX = 10;

export function clampRpe(value: number): number {
  return Math.min(RPE_MAX, Math.max(RPE_MIN, value));
}
