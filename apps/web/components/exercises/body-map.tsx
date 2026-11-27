import {
  type BodyMapView,
  DETAIL_SURFACES,
  type Muscle,
  type MuscleShading,
  exerciseMuscleShading,
} from "@jim/core";
import { type ArtFigure, BACK_ART, FRONT_ART } from "./body-map-art";

/**
 * Front and back body figures with one or more regions per muscle in the
 * controlled vocabulary (issue #252). The art is MuscleMap's flat vector
 * body (vendored in body-map-art.ts). Shaded regions fill with the accent
 * color at the given strength; the rest stay a neutral grey on a darker
 * silhouette, so the map reads in light and dark mode and with any accent
 * theme. Used on exercise detail (primary vs secondary muscles, cropped to
 * the upper or lower body when that's all the exercise works), as the weekly
 * volume heatmap and as the injury picker.
 */

/** Which side of the body a tap landed on, for a picker (issue #627). */
export type BodySide = "left" | "right" | null;

interface Region {
  muscle: Muscle;
  /** MuscleMap's surface, for Muscle detail shading; hand-drawn shapes have none. */
  surface?: string;
  side: BodySide;
  d: string;
}

/** MuscleMap draws the neck as part of the silhouette; these give it a shape of its own. */
const FRONT_NECK =
  "M478,214 C484,240 489,264 494,292 L530,292 C535,264 540,240 546,214 C532,224 492,224 478,214 Z";
const BACK_NECK = "M478,206 L546,206 C544,226 542,242 540,256 L484,256 C482,242 480,226 478,206 Z";

/**
 * MuscleMap has no hip flexors (#874); these sit in the bare hip crease
 * between the abs, the top of the quads and the adductors, where iliopsoas
 * surfaces. The viewer's left is the body's right on the front.
 */
const FRONT_HIP_FLEXORS: Region[] = [
  {
    muscle: "hip flexors",
    side: "right",
    d: "M448,712 C466,722 487,734 502,742 L497,774 C486,760 468,746 452,734 Z",
  },
  {
    muscle: "hip flexors",
    side: "left",
    d: "M576,712 C558,722 537,734 522,742 L527,774 C538,760 556,746 572,734 Z",
  },
];

const regions = (art: ArtFigure, neck: string, extra: Region[] = []): Region[] => [
  { muscle: "neck", side: null, d: neck },
  ...art.regions,
  ...extra,
];
const FRONT = regions(FRONT_ART, FRONT_NECK, FRONT_HIP_FLEXORS);
const BACK = regions(BACK_ART, BACK_NECK);

/** Every muscle the map can shade, for the test that keeps it in step with MUSCLES. */
export const BODY_MAP_MUSCLES = new Set<Muscle>([...FRONT, ...BACK].map((region) => region.muscle));

/**
 * The figure's own extent rather than MuscleMap's padded 1024×1536 canvas,
 * and one shared box per crop so the front and back line up side by side.
 */
const VIEW_BOX: Record<BodyMapView, string> = {
  full: "170 20 684 1440",
  upper: "170 34 684 750",
  lower: "170 612 684 838",
};

function Figure({
  art,
  regions,
  view,
  shading,
  surfaceShading,
  label,
  onPick,
}: {
  art: ArtFigure;
  regions: readonly Region[];
  view: BodyMapView;
  shading: MuscleShading;
  surfaceShading?: Readonly<Record<string, number>>;
  label: string;
  onPick?: (muscle: Muscle, side: BodySide) => void;
}) {
  return (
    <figure className="flex min-w-0 flex-1 flex-col items-center gap-1">
      <svg
        viewBox={VIEW_BOX[view]}
        className={`h-auto w-full ${view === "full" ? "max-w-36" : "max-w-44"}`}
        aria-hidden="true"
      >
        {art.outline.map((d) => (
          <path key={d} d={d} className="fill-zinc-300 dark:fill-zinc-800" />
        ))}
        {regions.map((region, index) => {
          const strength =
            surfaceShading && region.surface && region.surface in DETAIL_SURFACES
              ? (surfaceShading[region.surface] ?? 0)
              : (shading[region.muscle] ?? 0);
          // The neutral fill stays underneath, so a faint tint always reads
          // as "a little" rather than darker than an untrained muscle.
          return (
            // A tap here is a shortcut: the picker's buttons are the
            // accessible way to choose, so the drawing stays aria-hidden.
            // biome-ignore lint/a11y/useKeyWithClickEvents: the picker's buttons carry the keyboard path
            <g
              // biome-ignore lint/suspicious/noArrayIndexKey: the art is static
              key={index}
              onClick={onPick ? () => onPick(region.muscle, region.side) : undefined}
              className={onPick ? "cursor-pointer" : undefined}
            >
              <path d={region.d} className="fill-zinc-100 dark:fill-zinc-600" />
              {strength > 0 && <path d={region.d} className="fill-accent" fillOpacity={strength} />}
            </g>
          );
        })}
      </svg>
      <figcaption className="text-xs text-zinc-500 dark:text-zinc-500">{label}</figcaption>
    </figure>
  );
}

export function BodyMap({
  shading,
  label,
  view = "full",
  className = "",
  onPick,
  surfaceShading,
}: {
  shading: MuscleShading;
  /** Read out in place of the drawing, e.g. "Chest and triceps worked". */
  label: string;
  /** Crop to the upper or lower body; see bodyMapView in @jim/core. */
  view?: BodyMapView;
  className?: string;
  /** Makes each muscle tappable, with the side of the body it was tapped on (issue #627). */
  onPick?: (muscle: Muscle, side: BodySide) => void;
  /**
   * Muscle detail (issue #876): shading for the surfaces finer than a group
   * (front/side/rear delt, abs vs obliques), keyed by DETAIL_SURFACES.
   */
  surfaceShading?: Readonly<Record<string, number>>;
}) {
  return (
    <div role="img" aria-label={label} className={`flex gap-4 ${className}`}>
      <Figure
        art={FRONT_ART}
        regions={FRONT}
        view={view}
        shading={shading}
        surfaceShading={surfaceShading}
        label="Front"
        onPick={onPick}
      />
      <Figure
        art={BACK_ART}
        regions={BACK}
        view={view}
        shading={shading}
        surfaceShading={surfaceShading}
        label="Back"
        onPick={onPick}
      />
    </div>
  );
}

/** "Works chest; also triceps and shoulders", read out for the body map. */
export function muscleSummary(primary: readonly string[], secondary: readonly string[]): string {
  const list = (muscles: readonly string[]) =>
    muscles.length <= 1
      ? muscles.join("")
      : `${muscles.slice(0, -1).join(", ")} and ${muscles[muscles.length - 1]}`;
  const parts = [];
  if (primary.length > 0) parts.push(`Works ${list(primary)}`);
  if (secondary.length > 0)
    parts.push(`${primary.length > 0 ? "also" : "Also works"} ${list(secondary)}`);
  return parts.join("; ");
}

/**
 * The worked muscles by name, each with a swatch at its shade on the map, so
 * primary vs secondary reads off the colors with no caption to explain it.
 */
export function MuscleSwatches({
  primary,
  secondary,
  className = "",
}: {
  primary: readonly string[];
  secondary: readonly string[];
  className?: string;
}) {
  const shading = exerciseMuscleShading({ primaryMuscles: primary, secondaryMuscles: secondary });
  const muscles = [...new Set([...primary, ...secondary])];
  return (
    <ul
      className={`flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400 ${className}`}
    >
      {muscles.map((muscle) => (
        <li key={muscle} className="flex items-center gap-1.5 capitalize">
          <span
            aria-hidden="true"
            className="relative size-2.5 shrink-0 overflow-hidden rounded-sm bg-zinc-100 dark:bg-zinc-600"
          >
            <span
              className="absolute inset-0 bg-accent"
              style={{ opacity: shading[muscle as Muscle] ?? 0 }}
            />
          </span>
          {muscle}
        </li>
      ))}
    </ul>
  );
}
