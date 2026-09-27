import { clampRpe } from "@jim/core";

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
  return { ...current, [field]: value };
}
