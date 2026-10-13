/**
 * The largest values the server's `sets` columns can hold (issue #500):
 * weight is numeric(7,2), distance numeric(8,2), reps and duration integers.
 * A value past these overflows on every push, so the set would never sync;
 * it's refused when it's entered instead.
 */
export const SET_LIMITS = {
  weight: 99_999.99,
  reps: 9_999,
  durationSeconds: 999_999,
  distance: 999_999.99,
} as const;

export interface SetValuesToCheck {
  weight?: number | null;
  reps?: number | null;
  durationSeconds?: number | null;
  distance?: number | null;
}

const LABELS: Record<keyof typeof SET_LIMITS, string> = {
  weight: "Weight",
  reps: "Reps",
  durationSeconds: "Time",
  distance: "Distance",
};

/** Why these values can't be saved, in words for the user, or null when they fit. */
export function setValuesProblem(values: SetValuesToCheck): string | null {
  for (const field of Object.keys(SET_LIMITS) as (keyof typeof SET_LIMITS)[]) {
    const value = values[field];
    if (value == null) continue;
    if (!Number.isFinite(value) || value < 0) return `${LABELS[field]} must be a positive number.`;
    if (value > SET_LIMITS[field]) {
      return `${LABELS[field]} can't be more than ${SET_LIMITS[field].toLocaleString("en-US")}.`;
    }
  }
  return null;
}
