import type { RoutineIconColor, RoutineIconShape } from "@jim/core";

// Outline icons take their stroke from `currentColor`, so each color is a
// light/dark pair of Tailwind text classes rather than one fixed hex (issue
// #152): *-600 keeps enough contrast on the light background, *-400 on the
// dark one, where the *-600 shades read muddy. Full literal class names so
// Tailwind's scanner picks them up.
const COLOR_CLASS: Record<RoutineIconColor, string> = {
  red: "text-red-600 dark:text-red-400",
  orange: "text-orange-600 dark:text-orange-400",
  amber: "text-amber-600 dark:text-amber-400",
  green: "text-green-600 dark:text-green-400",
  teal: "text-teal-600 dark:text-teal-400",
  blue: "text-blue-600 dark:text-blue-400",
  indigo: "text-indigo-600 dark:text-indigo-400",
  pink: "text-pink-600 dark:text-pink-400",
};

// Shapes on a 24×24 grid, kept inside ~2.5..21.5 so a 2px stroke never
// clips at the viewBox edge. Regular polygons are precomputed around the
// center (pentagon and star nudged down to look optically centered).
const SHAPE_PATH: Record<RoutineIconShape, React.ReactNode> = {
  square: <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />,
  squircle: <path d="M12 3C19.2 3 21 4.8 21 12s-1.8 9-9 9-9-1.8-9-9 1.8-9 9-9Z" />,
  circle: <circle cx="12" cy="12" r="9" />,
  triangle: <polygon points="12,3 21.5,20 2.5,20" />,
  diamond: <polygon points="12,2.5 21.5,12 12,21.5 2.5,12" />,
  pentagon: <polygon points="12,3.1 21.04,9.66 17.58,20.29 6.42,20.29 2.96,9.66" />,
  hexagon: <polygon points="12,2.5 20.23,7.25 20.23,16.75 12,21.5 3.77,16.75 3.77,7.25" />,
  octagon: (
    <polygon points="15.64,3.22 20.78,8.36 20.78,15.64 15.64,20.78 8.36,20.78 3.22,15.64 3.22,8.36 8.36,3.22" />
  ),
  star: (
    <polygon points="12,2.8 14.53,9.32 21.51,9.71 16.09,14.13 17.88,20.89 12,17.1 6.12,20.89 7.91,14.13 2.49,9.71 9.47,9.32" />
  ),
};

export function RoutineIcon({
  shape,
  color,
  className = "h-4 w-4",
}: {
  shape: RoutineIconShape;
  color: RoutineIconColor;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinejoin="round"
      className={`inline-block shrink-0 ${COLOR_CLASS[color]} ${className}`}
    >
      {SHAPE_PATH[shape]}
    </svg>
  );
}

// Soft tile behind a routine icon (#787): the routine's own hue at low
// opacity, so the colored mark reads as an app-icon-like chip in lists.
const TILE_CLASS: Record<RoutineIconColor, string> = {
  red: "bg-red-500/12 dark:bg-red-400/15",
  orange: "bg-orange-500/12 dark:bg-orange-400/15",
  amber: "bg-amber-500/14 dark:bg-amber-400/15",
  green: "bg-green-500/12 dark:bg-green-400/15",
  teal: "bg-teal-500/12 dark:bg-teal-400/15",
  blue: "bg-blue-500/12 dark:bg-blue-400/15",
  indigo: "bg-indigo-500/12 dark:bg-indigo-400/15",
  pink: "bg-pink-500/12 dark:bg-pink-400/15",
};

/** A routine's outlined colored icon on a soft tile of the same hue (#787). */
export function RoutineIconTile({
  shape,
  color,
  size = "md",
}: {
  shape: RoutineIconShape;
  color: RoutineIconColor;
  /** sm: 26px for dense rows; md: 32px for list rows and cards. */
  size?: "sm" | "md";
}) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center ${TILE_CLASS[color]} ${
        size === "sm" ? "h-[26px] w-[26px] rounded-lg" : "h-8 w-8 rounded-[10px]"
      }`}
    >
      <RoutineIcon
        shape={shape}
        color={color}
        className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"}
      />
    </span>
  );
}
