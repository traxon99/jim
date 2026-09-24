export const ROUTINE_ICON_SHAPES = [
  "square",
  "triangle",
  "squircle",
  "circle",
  "diamond",
  "pentagon",
  "hexagon",
  "octagon",
  "star",
] as const;
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
 * Every shape × color pairing, in a fixed order (shape outermost). 9 shapes ×
 * 8 colors = 72 combinations, well past the "20+" issue #150 asked for.
 */
export const ROUTINE_ICON_COMBOS: readonly RoutineIcon[] = ROUTINE_ICON_SHAPES.flatMap((shape) =>
  ROUTINE_ICON_COLORS.map((color) => ({ iconShape: shape, iconColor: color })),
);

/**
 * A new routine's default icon (issue #152): a random shape/color pairing,
 * narrowed step by step so it stands out from what's already there.
 *
 * `existing` is expected oldest-first, so its last entry is the previous
 * routine. Candidates are, in order of preference:
 *   1. unused combos sharing neither shape nor color with the previous icon,
 *   2. any unused combo,
 *   3. any combo differing from the previous icon in both shape and color,
 *   4. anything.
 * The first non-empty tier wins and one of its entries is picked at random.
 * `random` is injectable (defaults to Math.random) so tests can pin it.
 */
export function pickDefaultRoutineIcon(
  existing: readonly RoutineIcon[],
  random: () => number = Math.random,
): RoutineIcon {
  const key = (icon: RoutineIcon) => `${icon.iconShape}:${icon.iconColor}`;
  const used = new Set(existing.map(key));
  const previous = existing.at(-1);
  const differsFromPrevious = (combo: RoutineIcon) =>
    !previous || (combo.iconShape !== previous.iconShape && combo.iconColor !== previous.iconColor);

  const unused = ROUTINE_ICON_COMBOS.filter((combo) => !used.has(key(combo)));
  const tiers = [
    unused.filter(differsFromPrevious),
    unused,
    ROUTINE_ICON_COMBOS.filter(differsFromPrevious),
    ROUTINE_ICON_COMBOS,
  ];
  const pool = tiers.find((tier) => tier.length > 0) ?? ROUTINE_ICON_COMBOS;
  const index = Math.min(Math.floor(random() * pool.length), pool.length - 1);
  const picked = pool.at(index);
  if (!picked) throw new Error("unreachable: ROUTINE_ICON_COMBOS is never empty");
  return picked;
}
