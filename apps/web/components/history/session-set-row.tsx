import { SetRestTag } from "@/components/workout/rest-stats-line";
import type { SessionDetailSet } from "@/lib/history/session-detail-entries";
import { setKindLabel } from "@/lib/sessions/set-kinds";
import { PR_KIND_LABELS } from "@/lib/workout/summary-exercises";
import { distanceUnitFor, formatTimedSet } from "@jim/core";

/**
 * One logged set in a finished workout, shared by the PWA's session detail
 * and the desktop portal's workout page so the two can't drift (#551).
 */
export function SessionSetRow({
  set,
  label,
  units,
  showRpe,
}: {
  set: SessionDetailSet;
  /** "1", "2", … from `setNumberLabels`; warm-ups show "W" instead. */
  label: string;
  units: "lb" | "kg";
  showRpe: boolean;
}) {
  return (
    <li className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        {set.kind === "warmup" ? (
          <span
            aria-label="Warm-up set"
            className="w-6 font-bold text-amber-500 dark:text-amber-400"
          >
            W
          </span>
        ) : (
          <span className="w-6 text-zinc-500 dark:text-zinc-500">#{label}</span>
        )}
        <span className="tabular-nums">
          {set.weight != null && set.reps != null
            ? `${set.weight.toLocaleString()} ${units} × ${set.reps}`
            : set.reps != null
              ? `${set.reps} reps`
              : (formatTimedSet(set, distanceUnitFor(units)) ?? "—")}
        </span>
        {showRpe && set.rpe != null && (
          <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-500">
            RPE {set.rpe}
          </span>
        )}
        {set.kind !== "working" && set.kind !== "warmup" && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            {setKindLabel(set.kind)}
          </span>
        )}
        <SetRestTag set={set} />
      </span>
      {set.prKinds.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {set.prKinds.map((kind) => (
            <span
              key={kind}
              className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-400"
            >
              PR · {PR_KIND_LABELS[kind] ?? kind}
            </span>
          ))}
        </span>
      )}
    </li>
  );
}
