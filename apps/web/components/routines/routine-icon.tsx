import type { RoutineIconColor, RoutineIconShape } from "@jim/core";

// Solid, evenly-saturated (Tailwind *-600) hex values so every swatch reads
// at the same brightness regardless of which color is picked, in both
// light and dark mode — same approach as accent-color-section.tsx's fixed
// hex swatches, just a wider palette since these need 8 distinct colors
// rather than 6.
const COLOR_HEX: Record<RoutineIconColor, string> = {
  red: "#dc2626",
  orange: "#ea580c",
  amber: "#d97706",
  green: "#16a34a",
  teal: "#0d9488",
  blue: "#2563eb",
  indigo: "#4f46e5",
  pink: "#db2777",
};

// True squircles need a superellipse path; a plain border-radius only
// approximates one, but that approximation (a rounder radius than "square"
// gets) is enough to read as visually distinct at icon size without pulling
// in an SVG-path dependency for it.
const SHAPE_STYLE: Record<RoutineIconShape, React.CSSProperties> = {
  square: { borderRadius: "15%" },
  squircle: { borderRadius: "34%" },
  triangle: { clipPath: "polygon(50% 3%, 4% 97%, 96% 97%)" },
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
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 ${className}`}
      style={{ backgroundColor: COLOR_HEX[color], ...SHAPE_STYLE[shape] }}
    />
  );
}
