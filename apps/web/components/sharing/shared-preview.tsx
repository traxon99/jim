"use client";

import { LoadingText } from "@/components/loading-text";
import { BackLink } from "@/components/page-header";
import { RoutineIcon } from "@/components/routines/routine-icon";
import { WEEKDAY_NAMES } from "@/lib/programs/weekdays";
import { routineItemSummary } from "@/lib/routines/summary";
import { type Result, openShareLink, revokeShareLink } from "@/lib/sharing/client";
import { addSharedSnapshot } from "@/lib/sharing/local";
import type { OpenedShareLink } from "@/lib/sharing/types";
import type { ShareSnapshot, SharedRoutine } from "@jim/core";
import { Layers } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

/**
 * A shared routine or program, opened from its link (issue #254): a
 * read-only preview and one button that copies it into the user's own rows.
 * The sharer sees a Revoke button instead of being nudged to add their own.
 */
export function SharedPreview({ id, userId }: { id: string; userId: string }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<Result<OpenedShareLink> | null>(null);
  const [adding, setAdding] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void openShareLink(id).then((result) => {
      if (!cancelled) setLoaded(result);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loaded === null) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <LoadingText />
      </main>
    );
  }

  if (!loaded.ok) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-xl font-semibold">Link not available</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{loaded.error}</p>
        <Link href="/routines" className="text-sm font-medium underline underline-offset-4">
          Back to routines
        </Link>
      </main>
    );
  }

  const link = loaded.value;
  const { snapshot } = link;
  const isProgram = snapshot.kind === "program";

  async function handleAdd() {
    setAdding(true);
    setError(null);
    try {
      const added = await addSharedSnapshot(userId, snapshot);
      router.push(
        added.kind === "program"
          ? `/routines/programs/${added.programId}`
          : `/routines/${added.routineId}`,
      );
    } catch {
      setError("Couldn't add it. Try again.");
      setAdding(false);
    }
  }

  async function handleRevoke() {
    if (!confirm("Revoke this link? Anyone who opens it after this won't see it.")) return;
    setRevoking(true);
    setError(null);
    const result = await revokeShareLink(id);
    setRevoking(false);
    if (result.ok) {
      setLoaded({ ok: false, error: "You revoked this link, so it doesn't work anymore." });
    } else {
      setError(result.error);
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-4 px-4 py-4">
      <div className="self-start">
        <BackLink href="/routines" label="Routines" />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
          {link.isMine ? "Your shared link" : `Shared by ${link.username ?? "a Jim user"}`}
        </p>
        <h1 className="flex min-w-0 items-center gap-2 text-xl font-semibold">
          {isProgram && (
            <Layers
              className="h-5 w-5 shrink-0 text-zinc-500 dark:text-zinc-500"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          )}
          <span className="min-w-0 break-words">{link.name}</span>
        </h1>
        {isProgram && (
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            {snapshot.program?.mode === "weekly" ? "Weekly schedule" : "Sequence"}
            {snapshot.program?.durationWeeks && ` · ${snapshot.program.durationWeeks} weeks`}
          </p>
        )}
        {snapshot.program?.notes && (
          <p className="text-sm text-zinc-700 dark:text-zinc-300">{snapshot.program.notes}</p>
        )}
      </div>

      {link.isMine ? (
        <button
          type="button"
          onClick={() => void handleRevoke()}
          disabled={revoking}
          className="min-h-11 rounded-lg border border-red-300 px-4 text-base font-medium text-red-600 disabled:opacity-50 dark:border-red-900 dark:text-red-500"
        >
          Revoke link
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={adding}
          className="flex min-h-14 items-center justify-center rounded-xl bg-accent px-4 text-lg font-semibold text-accent-foreground disabled:opacity-50"
        >
          {isProgram ? "Add to my programs" : "Add to my routines"}
        </button>
      )}
      {error && (
        <p role="alert" className="text-center text-sm text-red-600 dark:text-red-500">
          {error}
        </p>
      )}
      <p className="text-center text-xs text-zinc-500 dark:text-zinc-500">
        {link.isMine
          ? "This is a copy from when you shared it. Your later edits don't change it."
          : "Adding makes your own copy. Exercises you already have are reused."}
      </p>

      {isProgram && <ProgramSchedule snapshot={snapshot} />}

      {snapshot.routines.map((routine, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a snapshot never reorders
        <RoutinePreview key={index} routine={routine} snapshot={snapshot} />
      ))}
    </main>
  );
}
