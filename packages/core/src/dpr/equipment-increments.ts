import type { DprPreset } from "./presets";

/**
 * Equipment-aware weight steps for DPR (issue #202): every weight DPR
 * suggests is rounded to what the equipment can actually load.
 */

export type EquipmentBucket =
  | "barbell"
  | "ez-bar"
  | "dumbbell"
  | "machine"
  | "cable"
  | "kettlebell"
  | "other";

export type WeightUnits = "lb" | "kg";

export const DEFAULT_INCREMENTS: Readonly<Record<EquipmentBucket, Record<WeightUnits, number>>> = {
  barbell: { lb: 2.5, kg: 1.25 },
  "ez-bar": { lb: 2.5, kg: 1.25 },
  dumbbell: { lb: 5, kg: 2 },
  machine: { lb: 5, kg: 2.5 },
  cable: { lb: 5, kg: 2.5 },
  kettlebell: { lb: 9, kg: 4 },
  other: { lb: 5, kg: 2.5 },
};

/** User-edited steps, per bucket and unit; anything missing uses the default. */
export type IncrementOverrides = Partial<
  Record<EquipmentBucket, Partial<Record<WeightUnits, number>>>
>;

/**
 * Maps the free-text `exercises.equipment` value (e.g. "e-z curl bar",
 * "Dumbbells", "smith machine") to a bucket. The EZ-bar check runs before
 * the barbell one since "ez bar" variants often also say "bar".
 */
export function normalizeEquipment(text: string | null | undefined): EquipmentBucket {
  const value = (text ?? "")
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .trim();
  if (!value) return "other";
  if (/\bez\b|\be z\b|curl bar/.test(value)) return "ez-bar";
  if (value.includes("barbell")) return "barbell";
  if (value.includes("dumbbell")) return "dumbbell";
  if (value.includes("kettlebell")) return "kettlebell";
  if (value.includes("cable")) return "cable";
  if (value.includes("machine")) return "machine";
  return "other";
}

export function resolveIncrement(
  equipment: string | null | undefined,
  units: WeightUnits,
  userOverrides?: IncrementOverrides | null,
): number {
  const bucket = normalizeEquipment(equipment);
  const override = userOverrides?.[bucket]?.[units];
  if (override !== undefined && override > 0) return override;
  return DEFAULT_INCREMENTS[bucket][units];
}

export type RoundMode = "nearest" | "down" | "up";

/** Rounds to a multiple of `increment`, tidying float noise to 2 decimals. */
export function roundToIncrement(weight: number, increment: number, mode: RoundMode = "nearest") {
  if (increment <= 0) return Math.round(weight * 100) / 100;
  // A small epsilon so 187.49999… (float noise) still counts as 187.5 steps.
  const steps = weight / increment;
  const rounded =
    mode === "down"
      ? Math.floor(steps + 1e-9)
      : mode === "up"
        ? Math.ceil(steps - 1e-9)
        : Math.round(steps);
  return Math.round(rounded * increment * 100) / 100;
}

/** How much an increase adds: a % of `weight` rounded to the step, min one step. */
export function jumpFor(weight: number, preset: DprPreset, increment: number): number {
  if (preset.jumpPct === null) return increment;
  return Math.max(increment, roundToIncrement(weight * preset.jumpPct, increment, "nearest"));
}
