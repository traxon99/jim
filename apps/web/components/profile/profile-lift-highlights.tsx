import type { ProfileLiftHighlight } from "@/lib/friends/types";

/** Horizontal row of main-lift e1RM circles (mockup screens 5/6). */
export function ProfileLiftHighlights({
  lifts,
}: {
  lifts: readonly ProfileLiftHighlight[];
}) {
  if (lifts.length === 0) return null;
  return (
    <div className="flex w-full min-w-0 gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {lifts.map((lift) => (
        <div key={lift.key} className="flex w-16 shrink-0 flex-col items-center gap-1">
          <div className="flex h-14 w-14 flex-col items-center justify-center rounded-full border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <span className="text-base font-semibold tabular-nums leading-none">{lift.e1rm}</span>
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">e1RM</span>
          </div>
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{lift.label}</span>
        </div>
      ))}
    </div>
  );
}
