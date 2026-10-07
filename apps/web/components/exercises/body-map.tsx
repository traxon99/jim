import type { Muscle, MuscleShading } from "@jim/core";

/**
 * Front and back body outlines with one region per muscle in the controlled
 * vocabulary (issue #252). Shaded regions fill with the accent color at the
 * given strength; the rest stay a neutral grey, so the map reads in light and
 * dark mode and with any accent theme. Used on exercise detail (primary vs
 * secondary muscles) and as the weekly volume heatmap.
 *
 * Each figure is drawn in a 100×200 box. Paired muscles are drawn once on
 * the viewer's left half and mirrored; neck regions sit on the center line.
 */

interface Region {
  muscle: Muscle;
  d: string;
  /** Centered regions aren't mirrored. */
  center?: boolean;
}

const FRONT: Region[] = [
  { muscle: "neck", d: "M45,25 L55,25 L56,32 L44,32 Z", center: true },
  { muscle: "traps", d: "M44,29 L36,34 L44,34 Z" },
  { muscle: "shoulders", d: "M36,34 C30,34 25,38 25,46 L27,52 C30,48 34,45 37,44 Z" },
  { muscle: "chest", d: "M49,36 L38,36 C35,41 35,48 38,53 C43,55 47,55 49,54 Z" },
  { muscle: "biceps", d: "M26,53 C23,59 22,66 24,73 L30,72 C31,65 32,58 31,50 Z" },
  { muscle: "forearms", d: "M23,76 C20,84 19,92 19,100 L24,100 C26,92 28,84 30,75 Z" },
  { muscle: "abdominals", d: "M49,57 L39,56 C39,70 40,82 42,91 L49,95 Z" },
  { muscle: "abductors", d: "M37,88 C34,94 33,101 34,110 L38,100 L40,92 Z" },
  {
    muscle: "quadriceps",
    d: "M39,96 C35,108 35,126 38,142 L46,142 C47,132 47,124 46,118 C45,110 44,104 43,99 Z",
  },
  { muscle: "adductors", d: "M45,98 L49,100 L49,126 C48,118 47,110 45,102 Z" },
  { muscle: "calves", d: "M37,150 C35,160 35,172 38,184 L42,184 C42,172 42,160 41,150 Z" },
];

const BACK: Region[] = [
  { muscle: "neck", d: "M45,24 L55,24 L56,29 L44,29 Z", center: true },
  { muscle: "traps", d: "M49,30 L44,30 L36,34 C41,37 45,43 49,52 Z" },
  { muscle: "shoulders", d: "M35,34 C30,34 25,38 25,46 L27,52 C30,48 34,45 37,44 Z" },
  { muscle: "middle back", d: "M49,54 C46,46 43,41 39,39 L39,46 C42,52 45,58 49,62 Z" },
  { muscle: "lats", d: "M38,48 C36,57 37,67 42,78 L49,80 L49,65 C45,61 41,55 38,48 Z" },
  { muscle: "lower back", d: "M42,81 L49,83 L49,91 L42,90 Z" },
  { muscle: "triceps", d: "M26,53 C23,59 22,66 24,73 L30,72 C31,65 32,58 31,50 Z" },
  { muscle: "forearms", d: "M23,76 C20,84 19,92 19,100 L24,100 C26,92 28,84 30,75 Z" },
  { muscle: "abductors", d: "M40,86 C36,88 34,92 35,98 C37,95 39,93 41,92 Z" },
  { muscle: "glutes", d: "M49,94 L41,94 C36,98 35,107 38,114 C43,116 47,115 49,113 Z" },
  { muscle: "hamstrings", d: "M38,117 C36,126 37,136 39,144 L46,144 C48,134 48,125 48,117 Z" },
  { muscle: "calves", d: "M38,150 C35,158 35,168 37,176 L41,182 L45,176 C46,168 46,158 44,150 Z" },
];

/** Every muscle the map can shade, for the test that keeps it in step with MUSCLES. */
export const BODY_MAP_MUSCLES = new Set<Muscle>([...FRONT, ...BACK].map((region) => region.muscle));

/** Head, hands, knees and feet: context only, never shaded. */
const SILHOUETTE = [
  "M50,2 C44,2 41,7 41,13 C41,19 45,24 50,24 C55,24 59,19 59,13 C59,7 56,2 50,2 Z",
  "M19,102 C17,106 18,112 21,113 C24,112 25,106 24,102 Z",
  "M81,102 C83,106 82,112 79,113 C76,112 75,106 76,102 Z",
  "M38,144 L46,144 L45,149 L39,149 Z",
  "M62,144 L54,144 L55,149 L61,149 Z",
  "M38,186 L43,186 L44,194 C41,196 37,196 36,193 Z",
  "M62,186 L57,186 L56,194 C59,196 63,196 64,193 Z",
];

function Figure({
  regions,
  shading,
  label,
}: {
  regions: readonly Region[];
  shading: MuscleShading;
  label: string;
}) {
  return (
    <figure className="flex min-w-0 flex-1 flex-col items-center gap-1">
      <svg viewBox="0 0 100 200" className="h-auto w-full max-w-36" aria-hidden="true">
        {SILHOUETTE.map((d) => (
          <path key={d} d={d} className="fill-zinc-100 dark:fill-zinc-800" />
        ))}
        {regions.map((region) => {
          const strength = shading[region.muscle] ?? 0;
          // The neutral fill stays underneath, so a faint tint always reads
          // as "a little" rather than darker than an untrained muscle.
          const layers = (
            <>
              <path d={region.d} className="fill-zinc-200 dark:fill-zinc-700" />
              {strength > 0 && <path d={region.d} className="fill-accent" fillOpacity={strength} />}
            </>
          );
          return (
            <g key={region.muscle}>
              {layers}
              {!region.center && <g transform="matrix(-1 0 0 1 100 0)">{layers}</g>}
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
  className = "",
}: {
  shading: MuscleShading;
  /** Read out in place of the drawing, e.g. "Chest and triceps worked". */
  label: string;
  className?: string;
}) {
  return (
    <div role="img" aria-label={label} className={`flex gap-4 ${className}`}>
      <Figure regions={FRONT} shading={shading} label="Front" />
      <Figure regions={BACK} shading={shading} label="Back" />
    </div>
  );
}
