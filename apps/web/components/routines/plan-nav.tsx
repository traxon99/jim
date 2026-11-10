import Link from "next/link";

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
    <nav
      aria-label="Plan"
      className="grid grid-cols-3 gap-1 rounded-lg border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {SEGMENTS.map((segment) => (
        <Link
          key={segment.value}
          href={segment.href}
          replace
          scroll={false}
          aria-current={active === segment.value ? "page" : undefined}
          data-ripple
          className={`flex min-h-11 items-center justify-center rounded-md text-sm font-medium ${
            active === segment.value
              ? "bg-white shadow-sm dark:bg-zinc-800"
              : "text-zinc-500 dark:text-zinc-500"
          }`}
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
