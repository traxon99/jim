import { clampRpe, setValuesProblem } from "@jim/core";

export type SetField = "weight" | "reps" | "rpe";

export interface SetValues {
  weight: string | number | null;
  reps: number | null;
  rpe: string | number | null;
}

export interface SetPatch {
  weight: number | null;
  reps: number | null;
  rpe: number | null;
}

function toNumberOrNull(value: string | number | null): number | null {
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * A logged value as the set row shows it: "100" rather than the server's
 * "100.00", "10" rather than "10.0" (issue #646). Synced sets come back as
 * Postgres numeric strings with their trailing zeros, which made those rows
 * wider than ones logged on the phone and pushed the ✓ off the card.
 */
export function formatSetValue(value: string | number | null): string {
  const n = toNumberOrNull(value);
  if (n == null) return "";
  // Two decimals at most, so float noise like 102.49999 can't widen the row.
  return String(Math.round(n * 100) / 100);
}

/**
 * The patch to save when one value of a logged set is edited in place
 * (issue #234), or null when there's nothing to save: the input was empty,
 * isn't a valid value for the field, or matches what's already logged. The
 * other two values carry over from the set unchanged.
 */
export function setFieldEditPatch(set: SetValues, field: SetField, raw: string): SetPatch | null {
  const parsed = toNumberOrNull(raw);
  if (parsed == null || parsed < 0) return null;
  if (field === "reps" && !Number.isInteger(parsed)) return null;
  const value = field === "rpe" ? clampRpe(parsed) : parsed;

  const current: SetPatch = {
    weight: toNumberOrNull(set.weight),
    reps: toNumberOrNull(set.reps),
    rpe: toNumberOrNull(set.rpe),
  };
  if (current[field] === value) return null;
  // A value the server can't store would never sync (issue #500).
  if (field !== "rpe" && setValuesProblem({ [field]: value })) return null;
  return { ...current, [field]: value };
}
