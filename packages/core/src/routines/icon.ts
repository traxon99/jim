export const ROUTINE_ICON_SHAPES = ["square", "triangle", "squircle"] as const;
export type RoutineIconShape = (typeof ROUTINE_ICON_SHAPES)[number];

export const ROUTINE_ICON_COLORS = [
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "indigo",
  "pink",
] as const;
export type RoutineIconColor = (typeof ROUTINE_ICON_COLORS)[number];

export interface RoutineIcon {
  iconShape: RoutineIconShape;
  iconColor: RoutineIconColor;
}

/**
 * Every shape × color pairing, in a fixed order (shape outermost). 3 shapes ×
 * 8 colors = 24 combinations, comfortably past the "20+" the feature request
 * (issue #150) asked for so two dozen routines can each look distinct before
 * any pairing repeats.
 */
export const ROUTINE_ICON_COMBOS: readonly RoutineIcon[] = ROUTINE_ICON_SHAPES.flatMap((shape) =>
  ROUTINE_ICON_COLORS.map((color) => ({ iconShape: shape, iconColor: color })),
);

/**
 * A new routine's default icon: the first shape/color pairing not already
 * worn by an existing routine, so a user's list doesn't fill up with
 * repeats of the same default. Once every combination is taken, cycles back
 * through the list in the same fixed order rather than refusing to pick one.
 */
export function pickDefaultRoutineIcon(existing: readonly RoutineIcon[]): RoutineIcon {
  const used = new Set(existing.map((icon) => `${icon.iconShape}:${icon.iconColor}`));
  const unused = ROUTINE_ICON_COMBOS.find(
    (combo) => !used.has(`${combo.iconShape}:${combo.iconColor}`),
  );
  if (unused) return unused;

  const index = existing.length % ROUTINE_ICON_COMBOS.length;
  const cycled = ROUTINE_ICON_COMBOS.find((_, i) => i === index);
  if (!cycled) throw new Error("unreachable: ROUTINE_ICON_COMBOS is never empty");
  return cycled;
}
