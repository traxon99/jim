import Link from "next/link";

/**
 * An iOS segmented control (#787): a grey track with one solid thumb. Shared
 * by Plan's segments and the routine library's views.
 */
export const SEGMENTED_TRACK =
  "grid grid-cols-3 gap-0.5 rounded-[10px] bg-zinc-900/[0.07] p-0.5 dark:bg-white/[0.12]";

export function segmentClass(active: boolean): string {
  return `flex min-h-11 items-center justify-center rounded-lg text-sm tracking-[-0.01em] ${
    active
      ? "bg-white font-semibold shadow-[0_2px_6px_rgb(0_0_0/0.1),0_0_0_0.5px_rgb(0_0_0/0.04)] dark:bg-zinc-600"
      : "font-medium text-zinc-700 dark:text-zinc-300"
  }`;
}

export type PlanSegment = "program" | "routines" | "exercises";

const SEGMENTS: readonly { value: PlanSegment; label: string; href: string }[] = [
  { value: "program", label: "Program", href: "/routines" },
  { value: "routines", label: "Routines", href: "/routines?view=routines" },
  { value: "exercises", label: "Exercises", href: "/exercises" },
];

/**
 * Plan's three segments (#783). They're links, so Exercises keeps its own
 * route (and its floating exercise card) while Plan stays the active tab.
 */
export function PlanNav({ active }: { active: PlanSegment }) {
  return (
    <nav aria-label="Plan" className={SEGMENTED_TRACK}>
      {SEGMENTS.map((segment) => (
        <Link
          key={segment.value}
          href={segment.href}
          replace
          scroll={false}
          aria-current={active === segment.value ? "page" : undefined}
          data-ripple
          className={segmentClass(active === segment.value)}
        >
          {segment.label}
        </Link>
      ))}
    </nav>
  );
}

/** Which Plan segment /routines shows, from its `?view=` (#783). */
export function planSegmentFromView(view: string | null): Exclude<PlanSegment, "exercises"> {
  return view === "routines" ? "routines" : "program";
}
