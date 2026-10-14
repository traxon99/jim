import { RoutineIcon } from "@/components/routines/routine-icon";
import { WEEKDAY_NAMES } from "@/lib/programs/weekdays";
import { routineItemSummary } from "@/lib/routines/summary";
import type { ShareSnapshot, SharedRoutine } from "@jim/core";

// The read-only body of a shared routine or program (issues #254, #638): the
// schedule and every routine's exercises with their targets. Plain markup, no
// hooks, so the public page renders it on the server and the signed-in
// preview renders it on the client.

function RoutinePreview({
  routine,
  snapshot,
}: {
  routine: SharedRoutine;
  snapshot: ShareSnapshot;
}) {
  const warmup =
    routine.warmupRoutine === null ? null : (snapshot.routines[routine.warmupRoutine] ?? null);
  return (
    <section className="flex flex-col gap-1">
      <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold">
        <RoutineIcon
          shape={routine.iconShape}
          color={routine.iconColor}
          className="h-4 w-4 shrink-0"
        />
        <span className="min-w-0 truncate">{routine.name}</span>
      </h2>
      {(routine.kind === "warmup" || warmup) && (
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          {routine.kind === "warmup" ? "Warm-up routine" : `Warm-up: ${warmup?.name}`}
        </p>
      )}
      {routine.notes && <p className="text-sm text-zinc-700 dark:text-zinc-300">{routine.notes}</p>}
      <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
        {routine.items.map((item, index) => {
          const exercise = snapshot.exercises[item.exercise];
          const summary = routineItemSummary(
            {
              ...item,
              targetWeight: item.targetWeight === null ? null : String(item.targetWeight),
            },
            snapshot.units,
            exercise?.trackingType === "time",
          );
          return (
            // Items have no ids of their own; their order is fixed.
            // biome-ignore lint/suspicious/noArrayIndexKey: a snapshot never reorders
            <li key={index} className="flex min-w-0 flex-col gap-0.5 py-2">
              <span className="text-sm font-medium">{exercise?.name ?? "Unknown exercise"}</span>
              {summary && (
                <span className="text-sm tabular-nums text-zinc-500 dark:text-zinc-500">
                  {summary}
                </span>
              )}
              {item.notes && (
                <span className="text-sm text-zinc-700 dark:text-zinc-300">{item.notes}</span>
              )}
            </li>
          );
        })}
      </ul>
      {routine.items.length === 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-500">No exercises.</p>
      )}
    </section>
  );
}

function ProgramSchedule({ snapshot }: { snapshot: ShareSnapshot }) {
  const program = snapshot.program;
  if (!program) return null;
  return (
    <ol className="flex flex-col gap-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
      {program.entries.map((entry, index) => {
        const routine = entry.routine === null ? null : snapshot.routines[entry.routine];
        const when =
          program.mode === "weekly" && entry.weekday !== null
            ? WEEKDAY_NAMES[entry.weekday]
            : `Day ${index + 1}`;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: a snapshot never reorders
          <li key={index} className="flex min-w-0 justify-between gap-3">
            <span className="shrink-0 text-zinc-500 dark:text-zinc-500">{when}</span>
            <span className="min-w-0 truncate text-right">{routine?.name ?? "Rest day"}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** A share link's schedule (for a program) and each routine in it. */
export function SharedSnapshotView({ snapshot }: { snapshot: ShareSnapshot }) {
  return (
    <>
      {snapshot.kind === "program" && <ProgramSchedule snapshot={snapshot} />}
      {snapshot.routines.map((routine, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a snapshot never reorders
        <RoutinePreview key={index} routine={routine} snapshot={snapshot} />
      ))}
    </>
  );
}
